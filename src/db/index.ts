import { connect } from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const uri = process.env.MONGODB_URL!;


export const dbConnect = async () => {
    await connect(uri)
        .then(() => {
            console.log("db connected successfully.");
        })
        .catch((err) => {
            console.log("db connection error: ", err.message);
        });
}
