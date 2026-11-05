import dotenv from 'dotenv';
dotenv.config();

import { getDepartments } from '../services/chatbotService.js';

async function test() {
  try {
    console.log("Calling getDepartments...");
    const depts = await getDepartments();
    console.log("Success! Departments count:", depts.length);
  } catch (err) {
    console.error("FAILED! Error details:");
    console.error(err);
  }
}

test();
