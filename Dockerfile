# این Dockerfile کل ریپو رو (نه فقط پوشه‌ی web) داخل ایمیج می‌بره، چون سایت با
# fs.readFileSync مستقیم از ../data و ../reports (بیرون از web/) می‌خونه.
# برای Liara (یا هر PaaS دیگه‌ای که از Docker پشتیبانی کنه) استفاده می‌شه.

FROM node:22-alpine

WORKDIR /app

# اول فقط package.json رو کپی می‌کنیم تا لایه‌ی npm install کش بشه و دفعات بعد
# دیپلوی سریع‌تر باشه (تا وقتی وابستگی‌ها عوض نشدن).
COPY web/package.json web/package-lock.json ./web/
RUN cd web && npm ci

# حالا بقیه‌ی ریپو (data/، reports/، web/app و ...).
COPY . .

RUN cd web && npm run build

ENV NODE_ENV=production
EXPOSE 3000

WORKDIR /app/web
CMD ["npm", "run", "start", "--", "-p", "3000"]
