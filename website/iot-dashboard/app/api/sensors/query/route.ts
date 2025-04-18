import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

export async function POST(request: Request) {
  try {
    const { query } = await request.json();
    const client = await clientPromise;
    const db = client.db("iotDatabase");
    
    // IMPORTANT: Add validation and security checks here
    const result = await db.collection("sensors").find(JSON.parse(query)).toArray();
    
    return NextResponse.json(result);
  } catch (e) {
    console.error('Error executing custom query:', e);
    return NextResponse.json(
      { error: 'Failed to execute query' },
      { status: 500 }
    );
  }
}