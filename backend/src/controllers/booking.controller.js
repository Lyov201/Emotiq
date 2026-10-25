export const createBookingController = service => ({
  async availability(req, res) {
    res.json({ success: true, data: await service.availability(req.userId, req.validatedQuery) });
  },
  async create(req, res) {
    const booking = await service.create(req.userId, req.validatedBody);
    res.status(201).json({ success: true, message: 'Booking created successfully', data: { booking } });
  },
  async list(req, res) {
    res.json({ success: true, data: await service.list(req.userId, req.validatedQuery) });
  },
  async get(req, res) {
    res.json({ success: true, data: { booking: await service.get(req.userId, req.validatedParams.id) } });
  },
  async cancel(req, res) {
    const booking = await service.cancel(req.userId, req.validatedParams.id);
    res.json({ success: true, message: 'Booking cancelled', data: { booking } });
  },
});
