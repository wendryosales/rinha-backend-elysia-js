import { Elysia, t } from "elysia";
import { MongoClient } from "mongodb";

// db
const client = new MongoClient("mongodb://localhost:27017");

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
  ({ body, set }) => {
    set.status = 201;
    return body;
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

app.listen(3000);
console.log(
  `🦊 Elysia is running at ${app.server?.hostname}:${app.server?.port}`,
);
