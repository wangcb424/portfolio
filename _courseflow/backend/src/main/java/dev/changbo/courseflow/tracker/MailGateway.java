package dev.changbo.courseflow.tracker;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Component;
@Component
public class MailGateway {
  private final JavaMailSender sender;
  private final boolean demo;
  private final String from;
  public MailGateway(JavaMailSender sender,@Value("${courseflow.demo}") boolean demo,@Value("${courseflow.mail-from}") String from) {
    this.sender=sender; this.demo=demo; this.from=from;
  }
  public void send(String to,String subject,String body) {
    if(demo) return; // Demo delivery is clearly labelled SIMULATED in the outbox.
    SimpleMailMessage mail=new SimpleMailMessage(); mail.setFrom(from); mail.setTo(to);
    mail.setSubject(subject); mail.setText(body); sender.send(mail);
  }
}
