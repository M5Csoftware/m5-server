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
            required: false,
            trim: true,
        },
        // UPDATED: Changed to accept both String and Array
        apiUseCase: {
            type: mongoose.Schema.Types.Mixed, // Accepts both String and Array
            required: true,
            validate: {
                validator: function(value) {
                    // Ensure it's either a non-empty string or a non-empty array
                    if (typeof value === 'string') {
                        return value.trim().length > 0;
                    }
                    if (Array.isArray(value)) {
                        return value.length > 0;
                    }
                    return false;
                },
                message: 'apiUseCase must be a non-empty string or array'
            }
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