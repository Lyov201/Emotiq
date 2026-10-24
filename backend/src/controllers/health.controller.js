export const getHealth = (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Emotiq API is running',
  });
};
