import { Elysia, t } from "elysia";
import { MongoClient, ObjectId } from "mongodb";
import { createClient } from "redis";
import Queue from "bull";

// db
const client = new MongoClient("mongodb://db:27017", {
  auth: {
    username: "root",
    password: "root",
  },
});

await client.connect();
const db = client.db("elysia");
const collection = db.collection("pessoas");

collection.createIndex({ apelido: 1 }, { unique: true });
collection.createIndex({ nome: "text", apelido: "text", stacks: "text" });

// cache
const redisClient = async () => {
  const client = createClient({
    url: "redis://cache:6379",
  });
  await client.connect();
  return client;
};

// queue
const queue = new Queue("pessoas", {
  redis: {
    host: "cache",
    port: 6379,
  },
});

const app = new Elysia();

const bodySchema = t.Object(
  {
    apelido: t.Union([t.String({ maxLength: 32 }), t.Null()], {
      error: "Apelido inválido",
    }),
    nome: t.Union([t.String({ maxLength: 100 }), t.Null()], {
      error: "Nome inválido",
    }),
    nascimento: t.RegExp(/^\d{4}\-(0[1-9]|1[012])\-(0[1-9]|[12][0-9]|3[01])$/, {
      error: "Nascimento inválido",
    }),
    stacks: t.Union([t.Array(t.String({ maxLength: 32 })), t.Null()], {
      error: "Stacks inválidas",
    }),
  },
  {
    error: "Corpo inválido",
  },
);

app.post(
  "/pessoas",
  async ({ body, set }) => {
    const cache = await redisClient();
    const nickCached = await cache.get(body.apelido as string);
    if (!!nickCached) {
      set.status = 422;
      cache.quit();
      return { error: "Pessoa já cadastrada" };
    }
    await cache.set(body.apelido as string, "1");
    const id = new ObjectId();
    await queue.add("create-person", { id, ...body });
    // const { insertedId } = await collection.insertOne(body);
    set.status = 201;
    set.headers = { Location: `/pessoas/${id.toString()}` };
    await cache.set(id.toString(), JSON.stringify(body));
    cache.quit();
    return;
  },
  {
    beforeHandle: ({ body, set }) => {
      if (!body.nome || !body.apelido) {
        set.status = 422;
        return { error: "Nome e apelido são obrigatórios" };
      }
    },
    body: bodySchema,
  },
);

queue.process("create-person", async (job) => {
  const { id, ...body } = job.data;
  return collection.insertOne({
    _id: id,
    ...body,
  });
});

app.get(
  "/pessoas",
  async ({ query }) => {
    const { t } = query;
    const cache = await redisClient();
    const personCached = await cache.get(t as string);
    if (personCached) {
      cache.quit();
      return JSON.parse(personCached);
    }

    const results = await collection
      .find({
        $or: [
          { nome: { $regex: t, $options: "i" } },
          { apelido: { $regex: t, $options: "i" } },
          { stacks: { $regex: t, $options: "i" } },
        ],
      })
      .map((pessoa) => ({
        id: pessoa._id,
        nome: pessoa.nome,
        apelido: pessoa.apelido,
        nascimento: pessoa.nascimento,
        stacks: pessoa.stacks,
      }))
      .limit(50)
      .toArray();

    await cache.set(t as string, JSON.stringify(results));
    cache.quit();
    return results;
  },
  {
    query: t.Object(
      {
        t: t.String(),
      },
      {
        error: "Query inválida",
      },
    ),
  },
);

app.get(
  "/pessoas/:id",
  async ({ params, set }) => {
    const cache = await redisClient();
    const personsWithIdCache = await cache.get(params.id as string);
    cache.quit();
    if (personsWithIdCache) {
      return JSON.parse(personsWithIdCache);
    }

    const response = await collection.findOne({ _id: new ObjectId(params.id) });

    if (!response) {
      set.status = 404;
      return { error: "Pessoa não encontrada" };
    }

    set.status = 200;
    return {
      id: response._id,
      nome: response.nome,
      apelido: response.apelido,
      nascimento: response.nascimento,
      stacks: response.stacks,
    };
  },
  {
    params: t.Object(
      {
        id: t.String(),
      },
      {
        error: "Params inválidos",
      },
    ),
  },
);

app.get("contagem-pessoas", async () => {
  return collection.countDocuments();
});

app.listen(3000);
console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
);
