import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';
import { authenticateToken } from '../middleware/auth';
import { AuthRequest } from '../types';
import { z } from 'zod';

const router = Router();

const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
});

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

router.post('/register', async (req, res) => {
  try {
    const validationResult = registerSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validationResult.error.errors 
      });
    }

    const { email, password, firstName, lastName } = validationResult.data;

    const existingUsers = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (existingUsers.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [newUser] = await db
      .insert(users)
      .values({
        email,
        password: hashedPassword,
        firstName,
        lastName,
      })
      .returning();

    req.session.userId = newUser.id;

    // Explicitly save the session to ensure it's persisted
    req.session.save((saveErr) => {
      if (saveErr) {
        console.error('Session save error:', saveErr);
        return res.status(500).json({ error: 'Registration failed' });
      }

      const userResponse = {
        id: newUser.id,
        email: newUser.email,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        bio: newUser.bio,
        profileImageUrl: newUser.profileImageUrl,
        createdAt: newUser.createdAt,
      };

      res.status(201).json({
        user: userResponse,
      });
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const validationResult = loginSchema.safeParse(req.body);
    
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validationResult.error.errors 
      });
    }

    const { email, password } = validationResult.data;

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);

    if (!user || !user.password) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    req.session.regenerate((err) => {
      if (err) {
        console.error('Session regeneration error:', err);
        return res.status(500).json({ error: 'Login failed' });
      }

      req.session.userId = user.id;
      console.log('[Login] Session ID:', req.sessionID);
      console.log('[Login] Setting userId in session:', user.id);

      // Explicitly save the session to ensure it's persisted
      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('Session save error:', saveErr);
          return res.status(500).json({ error: 'Login failed' });
        }

        console.log('[Login] Session saved successfully');
        console.log('[Login] Session data after save:', req.session);

        const userResponse = {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          bio: user.bio,
          profileImageUrl: user.profileImageUrl,
          createdAt: user.createdAt,
        };

        res.json({
          user: userResponse,
        });
      });
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/demo-login', async (req, res) => {
  try {
    const demoEmail = "demo@movieapp.com";
    
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, demoEmail))
      .limit(1);

    if (!user) {
      return res.status(404).json({ error: 'Demo user not found' });
    }

    req.session.regenerate((err) => {
      if (err) {
        console.error('Session regeneration error:', err);
        return res.status(500).json({ error: 'Demo login failed' });
      }

      req.session.userId = user.id;
      console.log('[Demo Login] Session ID:', req.sessionID);
      console.log('[Demo Login] Setting userId in session:', user.id);

      req.session.save((saveErr) => {
        if (saveErr) {
          console.error('Session save error:', saveErr);
          return res.status(500).json({ error: 'Demo login failed' });
        }

        console.log('[Demo Login] Session saved successfully');

        const userResponse = {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          bio: user.bio,
          profileImageUrl: user.profileImageUrl,
          createdAt: user.createdAt,
        };

        res.json({
          user: userResponse,
        });
      });
    });
  } catch (error) {
    console.error('Demo login error:', error);
    res.status(500).json({ error: 'Demo login failed' });
  }
});

router.get('/me', authenticateToken, async (req: AuthRequest, res) => {
  try {
    console.log('[/me] Session ID:', req.sessionID);
    console.log('[/me] Session data:', req.session);
    console.log('[/me] Session userId:', req.session.userId);
    
    const userId = req.userId;

    if (!userId) {
      console.log('[/me] No userId found in request');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userResponse = {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      bio: user.bio,
      profileImageUrl: user.profileImageUrl,
      createdAt: user.createdAt,
    };

    res.json({ user: userResponse });
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

router.post('/logout', authenticateToken, async (req: AuthRequest, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destruction error:', err);
      return res.status(500).json({ error: 'Logout failed' });
    }
    res.json({ message: 'Logged out successfully' });
  });
});

export default router;
