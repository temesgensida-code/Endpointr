FROM python:3.12-slim-bookworm

WORKDIR /app

COPY requirements.txt .
COPY wheels /app/wheels
RUN pip install --find-links=/app/wheels -r requirements.txt && \
    rm -rf /app/wheels

COPY . .

EXPOSE 8000
