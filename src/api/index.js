// API client for interacting with Google Apps Script Backend

// IMPORTANT: Replace this with your actual Google Apps Script Web App URL after deploying Code.gs
export const API_URL = import.meta.env.VITE_APPS_SCRIPT_URL || "https://script.google.com/macros/s/AKfycbwNKxu4MFKMAYYk-C8JME41rS80M3h6GXbXoq_Qh84GJ0g52rWRriNkaYxuYmDH_PRQ/exec";

export const fetchPoints = async (date = null) => {
  let url = `${API_URL}?action=getPoints`;
  if (date) url += `&date=${date}`;
  
  const response = await fetch(url);
  const json = await response.json();
  if (json.status === 'success') {
    return json.data;
  }
  throw new Error(json.message);
};

export const fetchSummary = async () => {
  const url = `${API_URL}?action=getSummary`;
  const response = await fetch(url);
  const json = await response.json();
  if (json.status === 'success') {
    return json.data;
  }
  throw new Error(json.message);
};

export const logPoints = async (points) => {
  const response = await fetch(API_URL, {
    method: 'POST',
    body: JSON.stringify({
      action: 'logPoints',
      points: points
    }),
    headers: {
      'Content-Type': 'text/plain;charset=utf-8', // GAS requires text/plain for CORS without preflight issues sometimes
    }
  });
  
  const json = await response.json();
  if (json.status === 'success') {
    return true;
  }
  throw new Error(json.message);
};

// UUID Generation for Driver Identity
export const generateUUID = () => {
  let d = new Date().getTime();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = (d + Math.random()*16)%16 | 0;
    d = Math.floor(d/16);
    return (c==='x' ? r : (r&0x3|0x8)).toString(16);
  });
};
