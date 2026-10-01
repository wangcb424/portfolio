package dev.changbo.courseflow.tracker;
import jakarta.servlet.http.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.security.Principal;
import java.util.*;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {
  private final AuthService auth;
  private final SecurityContextRepository contexts;
  public AuthController(AuthService auth,SecurityContextRepository contexts) {this.auth=auth;this.contexts=contexts;}
  public record EmailRequest(@NotBlank @Email @Size(max=254) String email) {}
  public record VerifyRequest(@NotBlank @Email @Size(max=254) String email,@NotBlank @Pattern(regexp="[0-9]{6}") String code) {}
  @GetMapping("/csrf") public Map<String,String> csrf(CsrfToken token) { return Map.of("token",token.getToken(),"headerName",token.getHeaderName()); }
  @GetMapping("/me") public Map<String,Object> me(Principal principal) {
    return principal==null?Map.of("signedIn",false):Map.of("signedIn",true,"email",auth.email(principal.getName()));
  }
  @PostMapping("/request-code") public Map<String,String> request(@Valid @RequestBody EmailRequest body) {return auth.requestCode(body.email());}
  @PostMapping("/verify") public Map<String,Object> verify(@Valid @RequestBody VerifyRequest body,HttpServletRequest req,HttpServletResponse res) {
    String id=auth.verify(body.email(),body.code());
    req.getSession(); req.changeSessionId(); // Defend against session fixation.
    var context=SecurityContextHolder.createEmptyContext();
    context.setAuthentication(UsernamePasswordAuthenticationToken.authenticated(id,null,List.of(new SimpleGrantedAuthority("ROLE_USER"))));
    SecurityContextHolder.setContext(context);contexts.saveContext(context,req,res);
    return Map.of("signedIn",true,"email",auth.email(id));
  }
}
