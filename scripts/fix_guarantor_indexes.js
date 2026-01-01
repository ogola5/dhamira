/**
 * Fix Guarantor indexes - drop problematic loanId_1_clientId_1 index and recreate with proper partial filter
 * Run this script once to fix the index issue that prevents multiple external guarantors per loan
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/test';

async function fixGuarantorIndexes() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const guarantorsCollection = db.collection('guarantors');

    // Get current indexes
    const indexes = await guarantorsCollection.indexes();
    console.log('\nCurrent indexes:');
    indexes.forEach(idx => {
      console.log(`  - ${idx.name}:`, JSON.stringify(idx.key), idx.unique ? '(unique)' : '');
      if (idx.partialFilterExpression) {
        console.log(`    Partial filter:`, JSON.stringify(idx.partialFilterExpression));
      }
    });

    // Drop the problematic loanId_1_clientId_1 index if it exists
    const problematicIndex = indexes.find(idx => idx.name === 'loanId_1_clientId_1');
    if (problematicIndex) {
      console.log('\nDropping problematic index: loanId_1_clientId_1');
      await guarantorsCollection.dropIndex('loanId_1_clientId_1');
      console.log('Index dropped successfully');
    } else {
      console.log('\nIndex loanId_1_clientId_1 not found, nothing to drop');
    }

    // Recreate the index with proper partial filter using $type: 'objectId'
    console.log('\nCreating new loanId_1_clientId_1 index with proper partial filter...');
    await guarantorsCollection.createIndex(
      { loanId: 1, clientId: 1 },
      { 
        unique: true, 
        partialFilterExpression: { 
          clientId: { $type: 'objectId' } 
        },
        name: 'loanId_1_clientId_1'
      }
    );
    console.log('Index created successfully');

    // Also ensure the guarantorNationalId index has proper filter
    const nationalIdIndex = indexes.find(idx => idx.name === 'loanId_1_guarantorNationalId_1');
    if (nationalIdIndex) {
      console.log('\nDropping and recreating loanId_1_guarantorNationalId_1 index...');
      await guarantorsCollection.dropIndex('loanId_1_guarantorNationalId_1');
    }
    
    await guarantorsCollection.createIndex(
      { loanId: 1, guarantorNationalId: 1 },
      { 
        unique: true, 
        partialFilterExpression: { 
          guarantorNationalId: { $type: 'string', $gt: '' } 
        },
        name: 'loanId_1_guarantorNationalId_1'
      }
    );
    console.log('Index loanId_1_guarantorNationalId_1 created successfully');

    // Verify final indexes
    const finalIndexes = await guarantorsCollection.indexes();
    console.log('\nFinal indexes:');
    finalIndexes.forEach(idx => {
      console.log(`  - ${idx.name}:`, JSON.stringify(idx.key), idx.unique ? '(unique)' : '');
      if (idx.partialFilterExpression) {
        console.log(`    Partial filter:`, JSON.stringify(idx.partialFilterExpression));
      }
    });

    console.log('\n✓ Guarantor indexes fixed successfully');
    process.exit(0);
  } catch (error) {
    console.error('Error fixing guarantor indexes:', error);
    process.exit(1);
  }
}

fixGuarantorIndexes();
