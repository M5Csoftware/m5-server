import mongoose from "mongoose";

const APIRequestSchema = new mongoose.Schema(
    {
        customerCode: {
            type: String,
            required: true,
            unique: true,   // UNIQUE 1
            trim: true,
        },
        customerName: {
            type: String,
            required: true,
            trim: true,
        },
        email: {
            type: String,
            required: true,
            trim: true,
        },
        phone: {
            type: String,
            required: true,
            trim: true,
        },
        branch: {
            type: String,
            required: true,
            trim: true,
        },
        apiUseCase: {
            type: String,
            required: true,
            trim: true,
        },

        // Default status until admin approves
        Status: {
            type: String,
            default: "pending",
            trim: true,
        },

        // Must also be UNIQUE
        apiKey: {
            type: String,
            unique: true,   // UNIQUE 2
            sparse: true,   // allows empty "" before approval
            trim: true,
        },
    },
    { timestamps: true }
);

const APIRequest =
    mongoose.models.APIRequest ||
    mongoose.model("APIRequest", APIRequestSchema);

export default APIRequest;
