import { NextResponse } from 'next/server';
import clientPromise from '../../../lib/mongodb';
import { SensorData } from '@/types/sensor';

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db("iotDatabase");
    const alerts = await db.collection("sensorData")
      .find({})
      // Fix: Sort by the nested timestamp field
      .sort({ "sensorData.timestamp": -1 })
      .limit(100)
      .toArray();
    
    return NextResponse.json(alerts);
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch alerts' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const client = await clientPromise;
    const db = client.db("iotDatabase");
    const data = await request.json();

    // Handle marking alert as viewed
    if (data.action === 'markViewed') {
      const result = await db.collection("sensorData").updateOne(
        { _id: data.alertId },
        // Fix: Update the nested viewed field
        { $set: { "sensorData.viewed": true } }
      );
      return NextResponse.json({
        success: true,
        message: 'Alert marked as viewed'
      });
    }

    // Handle new alert creation
    const alertData: SensorData = data;
    
    // Fix: Structure the document correctly with nested sensorData
    const newDocument = {
      sensorData: {
        ...alertData,
        viewed: false,
        timestamp: new Date().toISOString()
      },
      createdAt: new Date().toISOString()
    };
    
    // Update sensor status if it's a poaching alert
    if (alertData.alertType === "Poaching alert") {
      await db.collection("sensors").updateOne(
        { id: alertData.sensorId },
        { $set: { status: 'alert' } }
      );
    }
    
    const result = await db.collection("sensorData").insertOne(newDocument);
    return NextResponse.json(result);
  } catch (e) {
    console.error('Error storing alert:', e);
    return NextResponse.json({ error: 'Failed to store alert' }, { status: 500 });
  }
}
