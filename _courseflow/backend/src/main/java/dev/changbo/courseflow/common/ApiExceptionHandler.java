package dev.changbo.courseflow.common;

import dev.changbo.courseflow.course.CourseNotFoundException;
import java.time.Instant;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {
  @ExceptionHandler(org.springframework.web.server.ResponseStatusException.class)
  public ResponseEntity<ApiError> status(org.springframework.web.server.ResponseStatusException e) {
    return ResponseEntity.status(e.getStatusCode()).body(new ApiError(Instant.now(),e.getStatusCode().value(),"Request failed",List.of(e.getReason()==null?"Request failed":e.getReason())));
  }

  @ExceptionHandler(org.springframework.mail.MailException.class)
  public ResponseEntity<ApiError> mailFailure(org.springframework.mail.MailException e) {
    return response(HttpStatus.SERVICE_UNAVAILABLE,"Email delivery is unavailable. Try again later.");
  }
  public record ApiError(Instant timestamp, int status, String error, List<String> details) {}

  @ExceptionHandler(CourseNotFoundException.class)
  public ResponseEntity<ApiError> notFound(CourseNotFoundException exception) {
    return response(HttpStatus.NOT_FOUND, exception.getMessage());
  }

  @ExceptionHandler({IllegalArgumentException.class})
  public ResponseEntity<ApiError> badRequest(RuntimeException exception) {
    return response(HttpStatus.BAD_REQUEST, exception.getMessage());
  }

  @ExceptionHandler(MethodArgumentNotValidException.class)
  public ResponseEntity<ApiError> validation(MethodArgumentNotValidException exception) {
    List<String> details = exception.getBindingResult().getFieldErrors().stream()
        .map(error -> error.getField() + ": " + error.getDefaultMessage()).toList();
    return new ResponseEntity<>(
        new ApiError(Instant.now(), 400, "Validation failed", details), HttpStatus.BAD_REQUEST);
  }

  private ResponseEntity<ApiError> response(HttpStatus status, String message) {
    return new ResponseEntity<>(
        new ApiError(Instant.now(), status.value(), status.getReasonPhrase(), List.of(message)), status);
  }
}
