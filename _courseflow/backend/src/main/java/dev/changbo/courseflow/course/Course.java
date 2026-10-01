package dev.changbo.courseflow.course;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.JoinTable;
import jakarta.persistence.ManyToMany;
import jakarta.persistence.Table;
import java.util.HashSet;
import java.util.Set;

@Entity
@Table(name = "courses")
public class Course {
  @Id
  @GeneratedValue(strategy = GenerationType.IDENTITY)
  private Long id;

  @Column(nullable = false, unique = true, length = 20)
  private String code;

  @Column(nullable = false)
  private String title;

  @Column(nullable = false, columnDefinition = "TEXT")
  private String description;

  @Column(nullable = false)
  private int credits;

  @ManyToMany
  @JoinTable(
      name = "prerequisites",
      joinColumns = @JoinColumn(name = "course_id"),
      inverseJoinColumns = @JoinColumn(name = "prerequisite_id"))
  private Set<Course> prerequisites = new HashSet<>();

  protected Course() {}

  public Course(String code, String title, String description, int credits) {
    this.code = code;
    this.title = title;
    this.description = description;
    this.credits = credits;
  }

  public Long getId() { return id; }
  public String getCode() { return code; }
  public String getTitle() { return title; }
  public String getDescription() { return description; }
  public int getCredits() { return credits; }
  public Set<Course> getPrerequisites() { return prerequisites; }
}
