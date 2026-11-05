class AppError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const bad = (msg) => new AppError(400, msg);

module.exports = { AppError, bad };
