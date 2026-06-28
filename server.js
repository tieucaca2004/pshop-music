const { createServer } = require("http");
const next = require("next");

const port = process.env.PORT || 3000;
const dev = process.env.NODE_ENV !== "production";

const app = next({ dev });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    createServer((req, res) => handle(req, res)).listen(port, () => {
      console.log(`Pshop Music server đang chạy tại cổng ${port}`);
    });
  })
  .catch((err) => {
    console.error("Lỗi khởi động server:", err);
    process.exit(1);
  });
