import { NextResponse } from 'next/server';
import clientPromise from '../../../../lib/mongodb';

export async function POST(request: Request) {
  try {
    const { query } = await request.json();
    const client = await clientPromise;
    const db = client.db("iotDatabase");
    
    // Parse and sanitize the query
    const parsedQuery = JSON.parse(query);
    
    const result = await db.collection("sensorData")
      .find(parsedQuery)
      .sort({ timestamp: -1 })
      .toArray();
    
    return NextResponse.json(result);
  } catch (e) {
    console.error('Error executing custom query:', e);
    return NextResponse.json(
      { error: 'Failed to execute query' },
      { status: 500 }
    );
  }
}