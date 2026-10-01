package dev.changbo.courseflow.config;

import org.springframework.context.annotation.*;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.*;

@Configuration
public class SecurityConfig {
  @Bean SecurityContextRepository securityContextRepository() { return new HttpSessionSecurityContextRepository(); }
  @Bean SecurityFilterChain filterChain(HttpSecurity http,SecurityContextRepository contexts) throws Exception {
    http.securityContext(c->c.securityContextRepository(contexts))
      .authorizeHttpRequests(a->a
        .requestMatchers("/api/auth/**","/api/status","/actuator/health").permitAll()
        .requestMatchers(HttpMethod.GET,"/api/catalog/**","/api/courses/**","/api/sections").permitAll()
        .requestMatchers("/api/**").authenticated()
        .requestMatchers("/actuator/**").denyAll()
        .anyRequest().permitAll())
      .exceptionHandling(e->e
        .authenticationEntryPoint((req,res,ex)->{res.setStatus(401);res.setContentType("application/json");res.getWriter().write("{\"details\":[\"Sign in to save and manage your watches.\"]}");})
        .accessDeniedHandler((req,res,ex)->{res.setStatus(403);res.setContentType("application/json");res.getWriter().write("{\"details\":[\"Refresh the page and try again.\"]}");}))
      .logout(l->l.logoutUrl("/api/auth/logout").invalidateHttpSession(true).deleteCookies("JSESSIONID")
        .logoutSuccessHandler((req,res,a)->res.setStatus(204)))
      .headers(h->h.contentSecurityPolicy(c->c.policyDirectives(
        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; worker-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'")));
    // Keep Spring Security's CSRF protection. The SPA retrieves a token before POST/PATCH/DELETE.
    return http.build();
  }
}
