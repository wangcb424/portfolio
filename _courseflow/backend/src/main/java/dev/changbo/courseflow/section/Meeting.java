package dev.changbo.courseflow.section;

import jakarta.persistence.*;
import java.time.DayOfWeek;
import java.time.LocalTime;

@Entity
@Table(name = "meetings")
public class Meeting {
  @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
  @ManyToOne(fetch = FetchType.LAZY, optional = false) @JoinColumn(name = "section_id") private Section section;
  @Enumerated(EnumType.STRING) @Column(name = "day_of_week", nullable = false) private DayOfWeek dayOfWeek;
  @Column(name = "start_time", nullable = false) private LocalTime startTime;
  @Column(name = "end_time", nullable = false) private LocalTime endTime;

  protected Meeting() {}

  public Meeting(DayOfWeek day, LocalTime start, LocalTime end) {
    this.dayOfWeek = day;
    this.startTime = start;
    this.endTime = end;
  }

  void attachTo(Section section) { this.section = section; }
  public DayOfWeek getDayOfWeek() { return dayOfWeek; }
  public LocalTime getStartTime() { return startTime; }
  public LocalTime getEndTime() { return endTime; }
}
