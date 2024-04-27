export type MessageProfile = {
    id: string;
    name: string;
    avatar?: string;
};

export type IncomingMessage = {
    message: {
        id: string;
        time: string;
        text: string;
        user: MessageProfile;
    };
    to: string;
    conversationId: string;
};

export type OutgoingMessageResponse = {
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

export type SeenData = {
    messageId: string;
    peerId: string;
    conversationId: string;
};