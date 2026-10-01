package dev.changbo.courseflow.schedule;

import static dev.changbo.courseflow.schedule.ScheduleModels.GenerateRequest;
import static dev.changbo.courseflow.schedule.ScheduleModels.ScheduleView;

import jakarta.validation.Valid;
import java.util.List;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/schedules")
public class ScheduleController {
  private final ScheduleService service;

  public ScheduleController(ScheduleService service) {
    this.service = service;
  }

  @PostMapping("/generate")
  public List<ScheduleView> generate(@Valid @RequestBody GenerateRequest request) {
    return service.generate(request);
  }
}
