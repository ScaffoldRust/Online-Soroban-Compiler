import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { FileManager } from './utils/fileManager';

const app = express();

// Security middleware
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    crossOriginEmbedderPolicy: false,
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
  })
);

// CORS configuration
app.use(
  cors({
    origin: 'http://localhost:4200',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    optionsSuccessStatus: 200,
  })
);

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.get('/', (_, res) =>
  res.send('Hello from Backend!' + '<br>' + 'The best online soroban compiler is coming...')
);

// Test endpoint for fileManager functionality
app.post('/api/test-filemanager', async (req, res) => {
  try {
    const {
      projectName = 'test-project',
      code = 'pub fn hello() -> &\'static str { "Hello, Soroban!" }',
    } = req.body;

    // Test project creation using FileManager class
    const project = await FileManager.createProject({
      code,
      projectName,
    });

    // Success response
    const response = {
      success: true,
      projectPath: project.projectPath,
      sourcePath: project.sourcePath,
      cargoPath: project.cargoPath,
      message: 'FileManager test completed successfully - Rust project created and cleaned up',
    };

    // Cleanup
    await project.cleanup();

    res.json(response);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong',
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.originalUrl} not found`,
  });
});

// Start server
app.listen(3000, () => {
  console.log('Server on http://localhost:3000');
  console.log('CORS restricted to http://localhost:4200');
});
