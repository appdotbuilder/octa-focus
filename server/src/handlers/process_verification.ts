import { db } from '../db';
import { taskVerificationsTable } from '../db/schema';
import { eq } from 'drizzle-orm';
import { type TaskVerification } from '../schema';

export const processVerification = async (verificationId: number): Promise<TaskVerification> => {
  try {
    // First, fetch the verification record
    const verification = await db.select()
      .from(taskVerificationsTable)
      .where(eq(taskVerificationsTable.id, verificationId))
      .execute();

    if (verification.length === 0) {
      throw new Error(`Verification with ID ${verificationId} not found`);
    }

    const currentVerification = verification[0];
    
    // Only process pending verifications
    if (currentVerification.verification_status !== 'pending') {
      throw new Error(`Verification ${verificationId} is not pending (status: ${currentVerification.verification_status})`);
    }

    // Check if verification has expired
    if (currentVerification.expires_at && new Date() > currentVerification.expires_at) {
      // Update to expired status
      const expiredResult = await db.update(taskVerificationsTable)
        .set({
          verification_status: 'expired',
          verified_at: new Date(),
        })
        .where(eq(taskVerificationsTable.id, verificationId))
        .returning()
        .execute();

      const expiredVerification = expiredResult[0];
      return {
        ...expiredVerification,
        confidence_score: expiredVerification.confidence_score,
      };
    }

    // Simulate AI processing based on verification type and task type
    const aiResult = await simulateAIProcessing(currentVerification);

    // Update the verification record with AI results
    const result = await db.update(taskVerificationsTable)
      .set({
        verified_reps: aiResult.verifiedReps,
        confidence_score: aiResult.confidenceScore,
        verification_status: aiResult.status,
        verified_at: new Date(),
      })
      .where(eq(taskVerificationsTable.id, verificationId))
      .returning()
      .execute();

    const updatedVerification = result[0];
    
    // Convert numeric fields back to numbers
    return {
      ...updatedVerification,
      confidence_score: updatedVerification.confidence_score,
    };
  } catch (error) {
    console.error('Verification processing failed:', error);
    throw error;
  }
};

// Simulate AI processing for different verification types and tasks
async function simulateAIProcessing(verification: any): Promise<{
  verifiedReps: number | null;
  confidenceScore: number;
  status: 'verified' | 'rejected';
}> {
  const { verification_type, task_type, expected_reps } = verification;
  
  // Simulate different AI behaviors based on verification type
  switch (verification_type) {
    case 'video':
      return simulateVideoAnalysis(task_type, expected_reps);
    case 'photo':
      return simulatePhotoAnalysis(task_type, expected_reps);
    case 'sensor':
      return simulateSensorAnalysis(task_type, expected_reps);
    case 'manual':
      return simulateManualVerification(expected_reps);
    default:
      throw new Error(`Unsupported verification type: ${verification_type}`);
  }
}

function simulateVideoAnalysis(taskType: string, expectedReps: number | null): {
  verifiedReps: number | null;
  confidenceScore: number;
  status: 'verified' | 'rejected';
} {
  // Simulate video analysis for different exercise types
  if (expectedReps === null) {
    // For non-quantifiable tasks, just verify completion
    return {
      verifiedReps: null,
      confidenceScore: 0.92,
      status: 'verified',
    };
  }

  // Simulate realistic AI counting with some variance
  const accuracy = Math.random() * 0.3 + 0.8; // 80-110% accuracy
  const verifiedReps = Math.round(expectedReps * accuracy);
  const confidence = Math.random() * 0.2 + 0.8; // 80-100% confidence

  // Low confidence or very inaccurate counts get rejected
  if (confidence < 0.7 || Math.abs(verifiedReps - expectedReps) > expectedReps * 0.4) {
    return {
      verifiedReps: verifiedReps,
      confidenceScore: confidence,
      status: 'rejected',
    };
  }

  return {
    verifiedReps: verifiedReps,
    confidenceScore: confidence,
    status: 'verified',
  };
}

function simulatePhotoAnalysis(taskType: string, expectedReps: number | null): {
  verifiedReps: number | null;
  confidenceScore: number;
  status: 'verified' | 'rejected';
} {
  // Photo analysis typically less accurate than video
  if (expectedReps === null) {
    return {
      verifiedReps: null,
      confidenceScore: 0.85,
      status: 'verified',
    };
  }

  // Photos can't count reps effectively, so we mainly verify presence/form
  const confidence = Math.random() * 0.3 + 0.6; // 60-90% confidence
  
  return {
    verifiedReps: 1, // Just indicates activity was detected
    confidenceScore: confidence,
    status: confidence > 0.7 ? 'verified' : 'rejected',
  };
}

function simulateSensorAnalysis(taskType: string, expectedReps: number | null): {
  verifiedReps: number | null;
  confidenceScore: number;
  status: 'verified' | 'rejected';
} {
  // Sensor data is typically very accurate
  if (expectedReps === null) {
    return {
      verifiedReps: null,
      confidenceScore: 0.98,
      status: 'verified',
    };
  }

  // High accuracy with sensor data
  const accuracy = Math.random() * 0.1 + 0.95; // 95-105% accuracy
  const verifiedReps = Math.round(expectedReps * accuracy);
  
  return {
    verifiedReps: verifiedReps,
    confidenceScore: 0.98,
    status: 'verified',
  };
}

function simulateManualVerification(expectedReps: number | null): {
  verifiedReps: number | null;
  confidenceScore: number;
  status: 'verified' | 'rejected';
} {
  // Manual verification always accepts the expected value
  return {
    verifiedReps: expectedReps,
    confidenceScore: 1.0,
    status: 'verified',
  };
}