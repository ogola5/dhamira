import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

async function run() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI not set');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection;
  const coll = db.collection('transactions');

  try {
    const indexes = await coll.indexes();
    console.log('Existing indexes:', indexes.map(i => i.name));

    // Find legacy compound index on { type:1, mpesaReceipt:1 }
    const legacy = indexes.find(i => i.key && i.key.type === 1 && i.key.mpesaReceipt === 1);
    if (legacy) {
      console.log('Found legacy index', legacy.name, '- dropping it');
      await coll.dropIndex(legacy.name);
    } else {
      console.log('No legacy compound index found');
    }

    // Create partial unique index ensuring uniqueness only when mpesaReceipt exists and not null
    console.log('Creating partial unique index on {type:1, mpesaReceipt:1}');
    await coll.createIndex(
      { type: 1, mpesaReceipt: 1 },
      {
        unique: true,
        partialFilterExpression: { mpesaReceipt: { $exists: true, $ne: null } },
        background: false,
      }
    );

    console.log('Index fixed. Current indexes:');
    console.log((await coll.indexes()).map(i => i.name));
  } catch (err) {
    console.error('Error fixing indexes:', err);
    process.exitCode = 2;
  } finally {
    await mongoose.disconnect();
  }
}

run();
