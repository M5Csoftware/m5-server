import { NextResponse } from "next/server";
import connectDB from "@/app/lib/db";
import Entity from "@/app/model/Entity";

// Ensure DB connection
connectDB();

export async function POST(req) {
    console.log("Hit the API route with method:", req.method);

    if (req.method === "POST") {
        try {
            const data = await req.json();
            console.log(data)

            const newEntity = new Entity(data);
            const savedEntity = await newEntity.save();

            return NextResponse.json(savedEntity, { status: 201 }); // 201 Created
        } catch (error) {
            console.error('Error saving entity:', error);
            return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
        }
    }

    // Method Not Allowed - If method is not POST
    return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 });
}

export async function GET(req) {
    console.log("Entities Requested");

    try {
        // Extract query parameters from the request URL
        const url = new URL(req.url);
        const entityType = url.searchParams.get('entityType');

        console.log("Fetching entities of type:", entityType);

        // Define the fields to select based on the entityType
        let projection;
        if (entityType === "Service") {
            projection = "code name sector activeOnPortal activeOnSoftware";
        } else if (entityType === "Misc Charges") {
            projection = "code name hsn taxCharges fuelCharges";
        } else {
            projection = "code name"; // Default fields for other entity types
        }

        // Retrieve entities based on the entityType and projection
        const entities = await Entity.find({ entityType }, projection);

        // Return the entities with a success status
        return NextResponse.json(entities, { status: 200 });
    } catch (error) {
        console.error('Error fetching entities:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}


export async function DELETE(req) {
    console.log("Hit the API route with method:", req.method);

    if (req.method === "DELETE") {
        try {
            // Extract query parameters using the URL's searchParams
            const url = new URL(req.url);
            const code = url.searchParams.get('code');
            console.log("Deleting entity with code:", code);

            // Check if 'code' is provided
            if (!code) {
                return NextResponse.json({ error: 'Code is required' }, { status: 400 });
            }

            // Find and delete the entity by its 'code'
            const deletedEntity = await Entity.findOneAndDelete({ code });

            if (!deletedEntity) {
                return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
            }

            return NextResponse.json({ message: 'Entity deleted successfully' }, { status: 200 });
        } catch (error) {
            console.error('Error deleting entity:', error);
            return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
        }
    }

    // Method Not Allowed - If method is not DELETE
    return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 });
}


export async function PUT(req) {
    console.log("Hit the API route with method:", req.method);

    if (req.method === "PUT") {
        try {
            // Extract query parameters using the URL's searchParams
            const url = new URL(req.url);
            const code = url.searchParams.get('code');
            console.log("Updating entity with code:", code);

            // Check if 'code' is provided
            if (!code) {
                return NextResponse.json({ error: 'Code is required' }, { status: 400 });
            }

            // Parse the incoming data to update
            const data = await req.json();

            // Find the entity by 'code' and update it with new data
            const updatedEntity = await Entity.findOneAndUpdate(
                { code },    // Search by 'code'
                { $set: data }, // Update with the new data
                { new: true }  // Return the updated entity
            );

            if (!updatedEntity) {
                return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
            }

            return NextResponse.json(updatedEntity, { status: 200 });
        } catch (error) {
            console.error('Error updating entity:', error);
            return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
        }
    }

    // Method Not Allowed - If method is not PUT
    return NextResponse.json({ error: 'Method Not Allowed' }, { status: 405 });
}