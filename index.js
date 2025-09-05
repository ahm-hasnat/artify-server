const express = require("express");
const cors = require("cors");
const app = express();
const port = process.env.PORT || 3000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
require("dotenv").config();
var admin = require("firebase-admin");

const decoded = Buffer.from(process.env.FB_SERVICE_KEY, "base64").toString(
  "utf8"
);
var serviceAccount = JSON.parse(decoded);

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.xkximz0.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const verifyToken = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  console.log(authHeader);

  if (!authHeader) {
    return res.status(401).send({ message: "Unauthorized access" });
  }

  const token = authHeader.split(" ")[1];
  const decoded = await admin.auth().verifyIdToken(token);
  req.decoded = decoded;
  next();
};

const verifyTokenEmail = async (req, res, next) => {
  if (req.decoded.email !== req.query.email) {
    return res.status(403).send({ message: "Forbidden" });
  }
  next();
};

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    await client.connect();

    const artifactCollection = client.db("artifactsDb").collection("artifacts");

    app.post("/artifactdata", async (req, res) => {
      const newArtifact = req.body;
      console.log(newArtifact);
      const result = await artifactCollection.insertOne(newArtifact);
      res.send(result);
    });

    app.post("/artifacts/:id/like", async (req, res) => {
      try {
        const { id } = req.params;
        const { email } = req.body;

        const artifact = await artifactCollection.findOne({
          _id: new ObjectId(id),
        });

        if (artifact.likedBy?.includes(email)) {
          await artifactCollection.updateOne(
            { _id: new ObjectId(id) },
            {
              $pull: { likedBy: email },
              $inc: { likes: -1 },
            }
          );
        } else {
          await artifactCollection.updateOne(
            { _id: new ObjectId(id) },
            {
              $addToSet: { likedBy: email },
              $inc: { likes: 1 },
            }
          );
        }

        updatedArtifact = await artifactCollection.findOne({
          _id: new ObjectId(id),
        });

        res.send(updatedArtifact);
      } catch (err) {
        console.error(err);
        res.status(500).send({ error: "Something went wrong" });
      }
    });

    app.get("/featured", async (req, res) => {
      const artifacts = await artifactCollection
        .find({ status: { $ne: "ongoing" } })
        .sort({ likes: -1 })
        .limit(6)
        .toArray();
      res.send(artifacts);
    });
    app.get("/allartifacts", async (req, res) => {
      const { search } = req.query;

      const query = search
        ? { artifactName: { $regex: search, $options: "i" } }
        : {};

      const allArtifacts = await artifactCollection
        .find(query, { projection: { likedBy: 0, email: 0 } })
        .toArray();

      res.send(allArtifacts);
    });

    app.get("/myartifacts", verifyToken, verifyTokenEmail, async (req, res) => {
      const email = req.query.email;
      const query = { email: email };
      const myArtifacts = await artifactCollection.find(query).toArray();
      res.send(myArtifacts);
    });

    app.get(
      "/likedartifacts",
      verifyToken,
      verifyTokenEmail,
      async (req, res) => {
        const email = req.query.email;
        const query = { likedBy: email };
        const likedArtifacts = await artifactCollection.find(query).toArray();
        res.send(likedArtifacts);
      }
    );

    app.get("/allartifacts/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await artifactCollection.findOne(query, {
        projection: { likedBy: 0, email: 0 },
      });
      res.send(result);
    });

    app.put("/allartifacts/:id", async (req, res) => {
      const id = req.params.id;
      const updatedArtifact = req.body;
      const result = await artifactCollection.updateOne(
        { _id: new ObjectId(id) },
        { $set: updatedArtifact }
      );
      res.send(result);
    });

    app.delete("/allartifacts/:id", async (req, res) => {
      const id = req.params.id;
      const result = await artifactCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Digging artifact in server..!");
});

app.listen(port, () => {
  console.log(`Artify server is running on port ${port}`);
});
