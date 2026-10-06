import type { RequestHandler } from 'express';
import type { LocationService } from '../services/location.service.js';
import type { ResolveLocationRequest } from '../schemas/request.schemas.js';

export function makeLocationController(service: LocationService): RequestHandler {
    return async (req, res, next) => {
        try {
            const body = req.body as ResolveLocationRequest;
            const location = await service.resolve(
                body.latitude,
                body.longitude,
                body.accuracyMeters,
            );
            res.json({ requestId: req.id, location });
        } catch (err) {
            next(err);
        }
    };
}