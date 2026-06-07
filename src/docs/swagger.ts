import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Express } from 'express';

const spec = swaggerJsdoc({
  definition: {
    openapi: '3.0.3',
    info: { title: 'Sprig — Quick Commerce API', version: '0.1.0' },
    servers: [{ url: '/api/v1' }],
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    },
    security: [{ bearerAuth: [] }],
  },
  // Per-route docs can be added as @openapi JSDoc blocks in *.routes.ts files.
  apis: ['./src/modules/**/*.routes.ts'],
});

export function mountDocs(app: Express) {
  app.use('/docs', swaggerUi.serve, swaggerUi.setup(spec));
  app.get('/openapi.json', (_req, res) => res.json(spec));
}
