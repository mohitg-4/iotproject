import { NextResponse } from 'next/server';
import clientPromise from '../../../lib/mongodb';
import { ObjectId } from 'mongodb';
import { Sensor } from '@/types/sensor';

export async function GET() {
  try {
    const client = await clientPromise;
    const db = client.db("iotDatabase");
    const sensors = await db.collection("sensors").find({}).toArray();
    return NextResponse.json(sensors);
  } catch (e) {
    return NextResponse.json({ error: 'Failed to fetch sensors' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const client = await clientPromise;
    const db = client.db("iotDatabase");
    const sensor: Sensor = await request.json();
    
    const result = await db.collection("sensors").insertOne({
      ...sensor,
      _id: sensor._id ? new ObjectId(sensor._id) : undefined,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: 'Failed to add sensor' }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const client = await clientPromise;
    const db = client.db("iotDatabase");
    const sensor: Sensor = await request.json();
    
    const result = await db.collection("sensors").updateOne(
      { id: sensor.id },
      { $set: sensor }
    );
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: 'Failed to update sensor' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
    try {
      const { searchParams } = new URL(request.url);
      const id = searchParams.get('id');
  
      if (!id) {
        return NextResponse.json(
          { error: 'Sensor ID is required' },
          { status: 400 }
        );
      }
  
      const client = await clientPromise;
      const db = client.db("iotDatabase");
      
      const result = await db.collection("sensors").deleteOne({ id: id });
      
      if (result.deletedCount === 0) {
        return NextResponse.json(
          { error: 'Sensor not found' },
          { status: 404 }
        );
      }
  
      return NextResponse.json(
        { message: 'Sensor deleted successfully' },
        { status: 200 }
      );
    } catch (e) {
      console.error('Error deleting sensor:', e);
      return NextResponse.json(
        { error: 'Failed to delete sensor' },
        { status: 500 }
      );
    }
  }

