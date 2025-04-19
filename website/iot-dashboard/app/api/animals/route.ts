import { NextResponse } from 'next/server';
import clientPromise from '../../../lib/mongodb';

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db("iotDatabase");
    const animals = await db.collection("animals").find({}).toArray();
    return NextResponse.json(animals);
  } catch (e) {
    console.error('MongoDB fetch error:', e);
    return NextResponse.json({ error: 'Failed to fetch animals' }, { status: 500 });
  }
}