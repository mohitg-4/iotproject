import { NextResponse } from 'next/server';
import clientPromise from '../../../lib/mongodb';

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db("iotDatabase");
    const sensorData = await db.collection("sensorData").find({}).toArray();
    
    return NextResponse.json(sensorData);
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch sensor data' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const client = await clientPromise;
    const db = client.db("iotDatabase");
    const data = await request.json();

    // Validate the data structure
    if (!data.timestamp || !data.sensorId || !data.alertType) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    const result = await db.collection("sensorData").insertOne({
      timestamp: new Date(data.timestamp),
      sensorId: data.sensorId,
      alertType: data.alertType,
      videoData: data.videoData || { available: false, data: "No video captured" },
      audioData: data.audioData || { available: false, data: "No audio captured" }
    });

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: 'Failed to insert sensor data' }, { status: 500 });
  }
}
