# LSTro - Electron + Playwright Boilerplate

Dự án mẫu kết hợp giữa Electron.js và Playwright để xây dựng và kiểm thử ứng dụng Desktop.

## Cấu trúc thư mục

- `src/main.js`: Main process của Electron.
- `src/preload.js`: Preload script để bảo mật API.
- `src/renderer/`: Chứa mã nguồn cho giao diện (HTML/CSS/JS).
- `tests/`: Chứa các bài kiểm thử E2E sử dụng Playwright.
- `playwright.config.js`: Cấu hình Playwright.

## Cài đặt

```bash
npm install
```

## Chạy ứng dụng

```bash
npm start
```

## Chạy kiểm thử (E2E Tests)

Chạy kiểm thử ở chế độ headless (mặc định):
```bash
npm test
```

Chạy kiểm thử và hiển thị cửa sổ Electron:
```bash
npm run test:headed
```

## Tính năng
- **Giao diện hiện đại**: Sử dụng CSS hiện đại với hiệu ứng Glassmorphism.
- **Bảo mật**: Sử dụng `contextIsolation` và `preload` script.
- **Tích hợp sẵn Playwright**: Dễ dàng viết test cho các tính năng của ứng dụng.
