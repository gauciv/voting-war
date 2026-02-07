# ⚔️ Voting War

A real-time two-team smash-voting app built as a **hands-on demo** for an AWS Cloud workshop. Participants will learn how to deploy a full-stack application using **three core AWS services**:

| Service | Role |
|---|---|
| **Amazon S3** | Hosts the static React frontend (HTML/CSS/JS) |
| **Amazon EC2** | Runs the Python/FastAPI backend server |
| **Amazon DynamoDB** | Stores scores with atomic counters |

Two teams. One button each. First to 100 smashes wins. Scores sync in real-time via WebSocket across every connected browser.

---

## Architecture

```
┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   S3 Bucket  │  HTTP   │  EC2 Instance│  boto3  │  DynamoDB    │
│  (Frontend)  │───────▶│  (Backend)   │────────▶│  (Database)  │
│  React SPA   │◀───────│  FastAPI     │◀────────│  Scores      │
└──────────────┘  WS/REST└──────────────┘         └──────────────┘
     Browser          Port 3000              Table: voting-war-scores
```

---

## Local Development

### Prerequisites

- Node.js ≥ 18
- Python ≥ 3.10

### Frontend

```bash
npm install
npm run dev          # → http://localhost:5173
```

### Backend

```bash
cd server
python -m venv venv
source venv/bin/activate        # Linux/Mac
# source venv/bin/activate.fish  # Fish shell
pip install -r requirements.txt
python main.py                  # → http://localhost:3000
```

Without AWS credentials the backend auto-falls back to an in-memory store — no AWS account needed for local dev.

---

## Environment Variables

| File | Purpose |
|---|---|
| `.env` (root) | Frontend build-time vars — where the API lives |
| `server/.env` | Backend runtime vars — AWS keys, CORS origins |

See `.env.example` (root) and `server/.env.example` for templates.

---

## 🚀 AWS Deployment Guide

> **Goal**: By the end of this guide every participant will have a live Voting War app running entirely on AWS, touching three foundational services: **S3, EC2, and DynamoDB**.

### Why these three services?

| Service | What it teaches |
|---|---|
| **S3** | Static hosting, bucket policies, public access — the simplest way to serve a website |
| **EC2** | Virtual servers, security groups, SSH, running a process — the backbone of cloud compute |
| **DynamoDB** | NoSQL, on-demand capacity, IAM permissions — managed database with zero server admin |

---

### Step 0 — Prerequisites

- An AWS account (free-tier eligible)
- An SSH key pair created in your target region (e.g. `ap-southeast-1`)
- The project cloned to your local machine

```bash
git clone <repo-url>
cd voting-war
```

---

### Step 1 — Create a DynamoDB Table

> **Why first?** We set up the database first because both the backend and the deployment config reference the table name. DynamoDB is a fully managed NoSQL database — no servers to patch, no storage to provision. You just create a table and start reading/writing.

1. Open the **DynamoDB** console → **Create table**
2. Configure:
   - **Table name**: `voting-war-scores`
   - **Partition key**: `pk` (String)
3. Under **Table settings**, select **On-demand** capacity mode (free-tier friendly, no need to guess read/write units)
4. Click **Create table** and wait for status **Active**

> **What just happened?** You now have a globally available key-value database. The app stores a single item (`pk = "current"`) with two numeric attributes (`team1`, `team2`). DynamoDB's atomic `ADD` operation guarantees no votes are ever lost, even under heavy concurrent traffic.

---

### Step 2 — Launch an EC2 Instance (Backend)

> **Why?** EC2 gives you a full virtual machine in the cloud. We'll use it to run the Python backend — the same way you'd run any server: SSH in, install dependencies, start the process. This is the most fundamental AWS compute service.

#### 2a. Launch the instance

1. Open the **EC2** console → **Launch instance**
2. Configure:
   - **Name**: `voting-war-backend`
   - **AMI**: Amazon Linux 2023 (free-tier eligible)
   - **Instance type**: `t2.micro` (free-tier)
   - **Key pair**: Select your existing key pair
3. Under **Network settings** → **Edit** → **Security group rules**, add:

   | Type | Port | Source | Why |
   |---|---|---|---|
   | SSH | 22 | My IP | So you can connect |
   | Custom TCP | 3000 | 0.0.0.0/0 | So browsers can reach the API |

4. Click **Launch instance**

#### 2b. Create an IAM user for DynamoDB access

> **Why an IAM user?** In a real production setup you'd use an IAM Role attached to the EC2 instance (no keys needed). But for this workshop, explicit access keys make it easier to see *exactly* what permissions are being granted — it's a better learning experience.

1. Open the **IAM** console → **Users** → **Create user**
2. **User name**: `voting-war-dynamo`
3. **Attach policies directly** → search and attach: `AmazonDynamoDBFullAccess`
4. Create the user → go to **Security credentials** tab → **Create access key**
5. Choose **Application running outside AWS** → create and **copy both keys** (you won't see the secret again)

#### 2c. SSH into EC2 and deploy the backend

```bash
ssh -i your-key.pem ec2-user@<EC2_PUBLIC_IP>
```

Install dependencies:

```bash
sudo dnf install python3.11 python3.11-pip git -y
```

Clone and set up:

```bash
git clone <repo-url>
cd voting-war/server
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Create the backend `.env`:

```bash
cat > .env << 'EOF'
CORS_ORIGINS=http://<S3_BUCKET_WEBSITE_URL>
AWS_ACCESS_KEY_ID=<YOUR_ACCESS_KEY>
AWS_SECRET_ACCESS_KEY=<YOUR_SECRET_KEY>
DYNAMODB_TABLE_NAME=voting-war-scores
EOF
```

> **What's happening here?**
> - `CORS_ORIGINS` tells the backend which frontends are allowed to call it (we'll fill in the real S3 URL after Step 3)
> - The AWS keys let boto3 (the Python AWS SDK) authenticate with DynamoDB
> - When these keys are present, the app automatically switches from the in-memory store to DynamoDB

Start the server:

```bash
nohup python main.py > server.log 2>&1 &
```

Verify it's running:

```bash
curl http://localhost:3000/api/health
# → {"status":"ok","db":"DynamoDBStore","ws_clients":0}
```

> **Checkpoint**: If `db` says `DynamoDBStore`, your EC2 instance is successfully talking to DynamoDB. If it says `LocalStore`, double-check your keys.

---

### Step 3 — Host the Frontend on S3

> **Why?** S3 isn't just file storage — it can serve a static website directly. Since our React app compiles to plain HTML/CSS/JS files, S3 is the cheapest and simplest way to host it. No servers, no scaling config, no uptime management.

#### 3a. Build the frontend (on your local machine)

First, point the frontend at your EC2 backend. Edit the root `.env`:

```bash
VITE_API_URL=http://<EC2_PUBLIC_IP>:3000/api
VITE_WS_URL=ws://<EC2_PUBLIC_IP>:3000/api/ws
```

> **Why build-time vars?** Vite bakes `VITE_` environment variables into the JavaScript bundle at build time. After `npm run build`, the compiled JS files contain the actual URL strings — no server needed to inject them at runtime. That's why S3 static hosting works.

Build:

```bash
npm install
npm run build      # → outputs to dist/
```

#### 3b. Create an S3 bucket

1. Open the **S3** console → **Create bucket**
2. **Bucket name**: `voting-war-frontend` (must be globally unique — add a suffix if needed)
3. **Region**: Same as your EC2/DynamoDB region
4. **Uncheck** "Block *all* public access" and acknowledge the warning

   > **Why public?** This bucket serves your website — browsers need to fetch the files. In production you'd put CloudFront in front, but for this workshop, direct S3 hosting keeps things simple.

5. Click **Create bucket**

#### 3c. Enable static website hosting

1. Go into your bucket → **Properties** tab
2. Scroll to **Static website hosting** → **Edit** → **Enable**
3. **Index document**: `index.html`
4. **Error document**: `index.html` (React is a single-page app — all routes should load index.html)
5. Save — note the **Bucket website endpoint** URL (e.g. `http://voting-war-frontend.s3-website-ap-southeast-1.amazonaws.com`)

#### 3d. Add a bucket policy for public read

Go to **Permissions** tab → **Bucket policy** → paste:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicRead",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::voting-war-frontend/*"
    }
  ]
}
```

> Replace `voting-war-frontend` with your actual bucket name.

#### 3e. Upload the build files

```bash
aws s3 sync dist/ s3://voting-war-frontend --delete
```

> Or use the S3 console: open the bucket → **Upload** → drag-drop everything inside the `dist/` folder.

#### 3f. Update CORS on EC2

Now that you have the S3 website URL, SSH back into EC2 and update the backend `.env`:

```bash
ssh -i your-key.pem ec2-user@<EC2_PUBLIC_IP>
cd voting-war/server
```

Update `CORS_ORIGINS` with the S3 website URL:

```bash
sed -i 's|CORS_ORIGINS=.*|CORS_ORIGINS=http://voting-war-frontend.s3-website-ap-southeast-1.amazonaws.com|' .env
```

Restart the server:

```bash
kill $(pgrep -f "python main.py")
nohup python main.py > server.log 2>&1 &
```

---

### Step 4 — Test It 🎉

1. Open the **S3 website endpoint** URL in your browser
2. You should see the Voting War interface
3. Open it in a second browser / phone — both should sync in real-time
4. Smash a team to 100 — watch the victory screen + auto-reset

> **What's happening end-to-end?**
> 1. Your browser loads `index.html` + JS from **S3**
> 2. The JS connects via WebSocket to the **EC2** backend on port 3000
> 3. When you click SMASH, the backend increments the score in **DynamoDB** using an atomic `ADD`
> 4. The backend broadcasts the new score to every connected browser via WebSocket
> 5. At 100 smashes, the server triggers victory → 8-second countdown → auto-reset

---

### Quick Reference — What Connects to What

```
Browser
  │
  │ loads HTML/CSS/JS
  ▼
S3 Bucket (static website hosting)
  │
  │ JS makes HTTP + WebSocket calls
  ▼
EC2 Instance (FastAPI on port 3000)
  │
  │ boto3 SDK calls (read/write scores)
  ▼
DynamoDB Table (voting-war-scores)
```

---

### Cleanup

To avoid charges after the workshop:

```bash
# Delete S3 bucket contents + bucket
aws s3 rb s3://voting-war-frontend --force

# Terminate EC2 instance
# → EC2 Console → Instances → Select → Instance state → Terminate

# Delete DynamoDB table
# → DynamoDB Console → Tables → voting-war-scores → Delete

# Delete IAM user
# → IAM Console → Users → voting-war-dynamo → Delete
```

---

## License

MIT
