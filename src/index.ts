import { Elysia, t } from "elysia";
import { MongoClient, ObjectId } from "mongodb";

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
    if (await collection.findOne({ apelido: body.apelido })) {
      set.status = 422;
      return { error: "Pessoa já cadastrada" };
    }
    const docRef = await collection.insertOne(body);
    set.status = 201;
    set.headers = { Location: `/pessoas/${docRef.insertedId.toString()}` };
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

app.get(
  "/pessoas",
  async ({ query }) => {
    const { t } = query;

    return collection
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
      .toArray();
  },
  {
    query: t.Object(
      {
        t: t.String({ maxLength: 32 }),
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
        id: t.String({ maxLength: 24 }),
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
