import express, { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';

export function verifyLinearSignature(req: Request, res: Response, next: NextFunction): Response | void {
  const signature = req.headers['linear-signature'] as string;
  const hmacSecret = process.env.LINEAR_WEBHOOK_SECRET;
  
  if (!hmacSecret) {
    console.error('LINEAR_WEBHOOK_SECRET not configured');
    return res.status(500).json({ message: 'Webhook secret not configured' });
  }

  if (!signature) {
    return res.status(401).json({ message: 'Missing signature' });
  }

  // Use raw body for signature verification (set by express.json verify option)
  const bodyString = (req as any).rawBody || JSON.stringify(req.body);
  
  const expectedSignature = crypto
    .createHmac('sha256', hmacSecret)
    .update(bodyString)
    .digest('hex');

  if (signature !== expectedSignature) {
    console.warn('Invalid signature from Linear webhook');
    console.warn('Received signature:', signature);
    console.warn('Expected signature:', expectedSignature);
    console.warn('Body string (first 100 chars):', bodyString.substring(0, 100));
    console.warn('Has rawBody:', !!(req as any).rawBody);
    return res.status(401).json({ message: 'Invalid signature' });
  }

  next();
}