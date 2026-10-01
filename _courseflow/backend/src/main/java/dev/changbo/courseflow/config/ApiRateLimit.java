package dev.changbo.courseflow.config;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.util.*;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
/** A bounded, single-instance rate limiter. Never trust arbitrary X-Forwarded-For headers. */
@Component
public class ApiRateLimit extends OncePerRequestFilter {
  private final Map<String,long[]> windows=new LinkedHashMap<>();
  @Override protected void doFilterInternal(HttpServletRequest req,HttpServletResponse res,FilterChain chain) throws ServletException,IOException {
    if(!req.getRequestURI().startsWith("/api/")) { chain.doFilter(req,res); return; }
    String key=req.getRemoteAddr()+":"+(req.getRequestURI().startsWith("/api/auth/")?"auth":"api");
    boolean denied;
    synchronized(windows) {
      long now=System.currentTimeMillis();
      windows.entrySet().removeIf(e->now-e.getValue()[0]>60000);
      if(windows.size()>=5000 && !windows.containsKey(key)) denied=true;
      else {
        long[] window=windows.computeIfAbsent(key,k->new long[]{now,0});
        denied=++window[1]>(key.endsWith("auth")?60:180);
      }
    }
    if(denied) {res.setStatus(429);res.setHeader("Retry-After","60");res.setContentType("application/json");res.getWriter().write("{\"details\":[\"Too many requests. Please wait a minute.\"]}");return;}
    chain.doFilter(req,res);
  }
}
