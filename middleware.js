// middleware.js
import { NextResponse } from 'next/server';

export function middleware(request) {
  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    const response = new NextResponse(null, { status: 204 });
    
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set(
      'Access-Control-Allow-Methods',
      'GET, POST, PUT, DELETE, PATCH, OPTIONS'
    );
    response.headers.set(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With, Accept'
    );
    response.headers.set('Access-Control-Max-Age', '86400');
    
    return response;
  }

  // Handle actual requests
  const response = NextResponse.next();
  
  response.headers.set('Access-Control-Allow-Origin', '*');
  
  return response;
}

export const config = {
  matcher: '/api/:path*',
};