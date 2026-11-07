export const createWellbeingController = service => ({
  async create(req, res) {
    res.status(201).json({ success: true, data: { entry: await service.create(req.userId, req.validatedBody) } });
  },
  async list(req, res) {
    res.json({ success: true, data: await service.list(req.userId, req.validatedQuery) });
  },
  async get(req, res) {
    res.json({ success: true, data: { entry: await service.get(req.userId, req.validatedParams.id) } });
  },
  async update(req, res) {
    res.json({ success: true, data: { entry: await service.update(req.userId, req.validatedParams.id, req.validatedBody) } });
  },
  async remove(req, res) {
    await service.remove(req.userId, req.validatedParams.id);
    res.status(204).end();
  },
});
