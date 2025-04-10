import { NextResponse } from 'next/server';
import clientPromise from '../../../lib/mongodb';

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db("iotDatabase");
    
    const sensorData = await db.collection("sensorData")
      .find({})
      .sort({ timestamp: -1 })
      .limit(100)  // Limit to recent readings
      .toArray();
    
    return NextResponse.json(sensorData);
  } catch (e) {
    return NextResponse.json(
      { error: 'Failed to fetch sensor data' },
      { status: 500 }
    );
  }
}