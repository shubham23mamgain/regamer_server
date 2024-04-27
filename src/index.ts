import 'dotenv/config';
import 'express-async-errors';
import express from "express";
import morgan from "morgan";
import path from "path";
import formidable from "formidable";
import helmet from 'helmet';
import swaggerUi from "swagger-ui-express";

const swaggerDocument = require("./swagger.json");
import { dbConnect } from 'src/db';
import { sendErrorRes } from './utils/helper';

// importing Routes
import authRouter from "routes/auth";
import productRouter from 'routes/product';
import conversationRouter from "routes/conversation";
import mySocketServer from './server';

const app = express();

const port = process.env.PORT || 3000
dbConnect();

// Middlewares
app.use(morgan("dev"));
app.use(express.static("src/public"));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.disable('x-powered-by'); //  Hide that app is made using express
app.use(helmet());   // adding security to app

// Routes 
app.use("/auth", authRouter);
app.use("/product", productRouter);
app.use("/conversation", conversationRouter);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));
// Custom Endpoints
app.get('/', (req, res) => {
    // res.status(200).json({ message: 'This message is coming from Server. For description of endpoints hit /api-docs endpoint' });
    res.redirect(`/api-docs`);
})

// Implementing Socket.io from server.ts
mySocketServer();

// Test image upload using Formidable
app.post("/upload-file", async (req, res) => {
    const form = formidable({
        uploadDir: path.join(__dirname, "public"),
        filename(name, ext, part, form) {
            return Date.now() + "_" + part.originalFilename;
        },
    });
    await form.parse(req);

    res.send("ok");
});

// All express-async-errors  requests is handled by this middleware and we dont need to envelope each of our code in try catch block
app.use(function (err, req, res, next) {
    res.status(500).json({ message: err.message });
} as express.ErrorRequestHandler);

// Not Found Route in case of non-existent routes or wrong METHOD
app.use("*", (req, res) => {
    sendErrorRes(res, "Endpoint Not Found!", 404);
});

app.listen(port, () => console.log(`Server listening on port http://localhost:${port}`))