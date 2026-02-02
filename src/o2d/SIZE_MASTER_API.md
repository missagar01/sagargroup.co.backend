# Size Master API Documentation

## Overview
This API provides endpoints to fetch size master data from the PostgreSQL database hosted on AWS RDS.

## Database Configuration
The API connects to the following PostgreSQL database:
- **Host**: database-2-mumbai.c1wm8i46kcmm.ap-south-1.rds.amazonaws.com
- **Database**: Lead-To-Order
- **Port**: 5432
- **Table**: size_master

## Endpoints

### 1. Get All Size Master Data
Fetches all records from the `size_master` table.

**Endpoint**: `GET /api/o2d/size-master`

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      // ... other fields from size_master table
    },
    {
      "id": 2,
      // ... other fields from size_master table
    }
  ],
  "count": 2
}
```

**Example Request**:
```bash
curl http://localhost:3004/api/o2d/size-master
```

### 2. Get Size Master by ID
Fetches a specific size master record by its ID.

**Endpoint**: `GET /api/o2d/size-master/:id`

**Parameters**:
- `id` (path parameter): The ID of the size master record

**Response** (Success):
```json
{
  "success": true,
  "data": {
    "id": 1,
    // ... other fields from size_master table
  }
}
```

**Response** (Not Found):
```json
{
  "success": false,
  "message": "Size master record not found"
}
```

**Example Request**:
```bash
curl http://localhost:3004/api/o2d/size-master/1
```

## Error Handling
All endpoints return appropriate HTTP status codes:
- `200`: Success
- `404`: Resource not found
- `500`: Internal server error

Error responses follow this format:
```json
{
  "success": false,
  "message": "Error description"
}
```

## Files Created

### Service Layer
**File**: `src/o2d/services/sizeMaster.service.js`
- Contains business logic for fetching size master data
- Uses PostgreSQL connection from `config/pg.js`

### Controller Layer
**File**: `src/o2d/controllers/sizeMaster.controller.js`
- Handles HTTP request/response
- Calls service layer functions
- Formats responses

### Routes
**File**: `src/o2d/routes/sizeMaster.routes.js`
- Defines API endpoints
- Maps routes to controller functions

## Testing the API

1. **Start the server**:
```bash
cd "f:\O2D Merge Backned\backend"
npm start
```

2. **Test with curl**:
```bash
# Get all size master data
curl http://localhost:3004/api/o2d/size-master

# Get specific size master by ID
curl http://localhost:3004/api/o2d/size-master/1
```

3. **Test with browser**:
- Open: `http://localhost:3004/api/o2d/size-master`
- Open: `http://localhost:3004/api/o2d/size-master/1`

4. **Test with Postman**:
- Method: GET
- URL: `http://localhost:3004/api/o2d/size-master`

## Notes
- The API uses the PostgreSQL connection pool configured in `config/pg.js`
- SSL is automatically enabled for AWS RDS connections
- The connection includes retry logic for better reliability
- All queries are parameterized to prevent SQL injection
