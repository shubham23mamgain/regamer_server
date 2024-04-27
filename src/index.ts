import 'dotenv/config';
import 'express-async-errors';
import express from "express";
import morgan from "morgan";
import path from "path";
import formidable from "formidable";
import helmet from 'helmet';
import swaggerUi from "swagger-ui-express";
import { TokenExpiredError, verify } from "jsonwebtoken";
import { updateSeenStatus } from "./controllers/conversation";
import ConversationModel from "./models/conversation";
import { IncomingMessage, OutgoingMessageResponse, SeenData } from "./socketTypes";
import { Server } from "socket.io";
import http from "http";

const swaggerDocument = require("./swagger.json");
import { dbConnect } from 'src/db';
import { sendErrorRes } from './utils/helper';

// importing Routes
import authRouter from "routes/auth";
import productRouter from 'routes/product';
import conversationRouter from "routes/conversation";


const app = express();
const server = http.createServer(app);
const port = process.env.PORT || 3000
const io = new Server(server, {
    path: "/socket-message",
});
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
io.use((socket, next) => {
    const socketReq = socket.handshake.auth as { token: string } | undefined;
    if (!socketReq?.token) {
        return next(new Error("Unauthorized request!"));
    }

    try {
        socket.data.jwtDecode = verify(socketReq.token, process.env.JWT_SECRET!);
    } catch (error) {
        if (error instanceof TokenExpiredError) {
            return next(new Error("jwt expired"));
        }

        return next(new Error("Invalid token!"));
    }

    next();
});




io.on("connection", (socket) => {
    const socketData = socket.data as { jwtDecode: { id: string } };
    const userId = socketData.jwtDecode.id;

    socket.join(userId);

    // console.log("user is connected");
    socket.on("chat:new", async (data: IncomingMessage) => {
        const { conversationId, to, message } = data;

        await ConversationModel.findByIdAndUpdate(conversationId, {
            $push: {
                chats: {
                    sentBy: message.user.id,
                    content: message.text,
                    timestamp: message.time,
                },
            },
        });

        const messageResponse: OutgoingMessageResponse = {
            from: message.user,
            conversationId,
            message: { ...message, viewed: false },
        };

        socket.to(to).emit("chat:message", messageResponse);
    });

    socket.on(
        "chat:seen",
        async ({ conversationId, messageId, peerId }: SeenData) => {
            await updateSeenStatus(peerId, conversationId);
            socket.to(peerId).emit("chat:seen", { conversationId, messageId });
        }
    );

    socket.on("chat:typing", (typingData: { to: string; active: boolean }) => {
        socket.to(typingData.to).emit("chat:typing", { typing: typingData.active });
    });
});

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

server.listen(port, () => console.log(`Server listening on port http://192.168.29.220:${port}`))