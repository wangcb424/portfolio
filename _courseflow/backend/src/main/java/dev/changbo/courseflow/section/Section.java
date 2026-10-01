package dev.changbo.courseflow.section;

import dev.changbo.courseflow.course.Course;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.Set;

@Entity
@Table(name = "sections")
public class Section {
  @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
  @ManyToOne(fetch = FetchType.EAGER, optional = false) @JoinColumn(name = "course_id") private Course course;
  @Column(nullable = false, unique = true, length = 20) private String crn;
  @Column(nullable = false, length = 30) private String term;
  @Column(nullable = false, length = 120) private String instructor;
  @Column(nullable = false) private int capacity;
  @Column(name = "available_seats", nullable = false) private int availableSeats;
  @Column(name = "seats_checked_at", nullable = false) private Instant seatsCheckedAt;
  @OneToMany(mappedBy = "section", fetch = FetchType.EAGER, cascade = CascadeType.ALL)
  @OrderBy("dayOfWeek,startTime")
  private Set<Meeting> meetings = new LinkedHashSet<>();

  protected Section() {}

  public Section(Course course, String crn, String term, String instructor,
                 int capacity, int availableSeats, Instant seatsCheckedAt) {
    this.course = course;
    this.crn = crn;
    this.term = term;
    this.instructor = instructor;
    this.capacity = capacity;
    this.availableSeats = availableSeats;
    this.seatsCheckedAt = seatsCheckedAt;
  }

  public void addMeeting(Meeting meeting) {
    meeting.attachTo(this);
    meetings.add(meeting);
  }

  public Long getId() { return id; }
  public Course getCourse() { return course; }
  public String getCrn() { return crn; }
  public String getTerm() { return term; }
  public String getInstructor() { return instructor; }
  public int getCapacity() { return capacity; }
  public int getAvailableSeats() { return availableSeats; }
  public Instant getSeatsCheckedAt() { return seatsCheckedAt; }
  public Set<Meeting> getMeetings() { return meetings; }
}
