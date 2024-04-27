import express from "express";
import { Server } from "socket.io";
import http from "http";


import ConversationModel from "./models/conversation";
import { updateSeenStatus } from "./controllers/conversation";
import { TokenExpiredError, verify } from "jsonwebtoken";


const app = express();
const server = http.createServer(app);

type MessageProfile = {
    id: string;
    name: string;
    avatar?: string;
};

type IncomingMessage = {
    message: {
        id: string;
        time: string;
        text: string;
        user: MessageProfile;
    };
    to: string;
    conversationId: string;
};

type OutgoingMessageResponse = {
    message: {
        id: string;
        time: string;
        text: string;
        user: MessageProfile;
        viewed: boolean;
    };
    from: MessageProfile;
    conversationId: string;
};

type SeenData = {
    messageId: string;
    peerId: string;
    conversationId: string;
};

const mySocketServer = () => {
    const io = new Server(server, {
        path: "/socket-message",
    });

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
}



export default mySocketServer;

