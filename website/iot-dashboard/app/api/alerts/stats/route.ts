import { NextResponse } from 'next/server';
import clientPromise from '../../../../lib/mongodb';

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db("iotDatabase");
    // Changed from 'alerts' to 'sensorData'
    const alerts = await db.collection("sensorData").find({ 
      "alert.viewed": false 
    }).toArray();

    const stats = {
      unreadCount: alerts.length,
      mostRecentTime: alerts.length > 0 ? 
        new Date(Math.max(...alerts.map(a => new Date(a.timestamp).getTime()))).toISOString() : '',
      oldestTime: alerts.length > 0 ? 
        new Date(Math.min(...alerts.map(a => new Date(a.timestamp).getTime()))).toISOString() : ''
    };

    return NextResponse.json(stats);
  } catch (e) {
    console.error('Error fetching alert stats:', e);
    return NextResponse.json({ error: 'Failed to fetch alert statistics' }, { status: 500 });
  }
}