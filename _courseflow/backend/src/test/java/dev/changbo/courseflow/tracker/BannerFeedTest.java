package dev.changbo.courseflow.tracker;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.io.IOException;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
class BannerFeedTest {
  final ObjectMapper json=new ObjectMapper();
  final String sample="""
    {"success":true,"totalCount":1,"data":[{"term":"202710","subject":"CS","courseNumber":"3100",
    "courseReferenceNumber":"17206","sequenceNumber":"01","courseTitle":"Program Design &amp; Implementation",
    "maximumEnrollment":100,"seatsAvailable":2,"faculty":[],"meetingsFaculty":[{"meetingTime":{
    "monday":true,"wednesday":true,"beginTime":"1450","endTime":"1630"}}]}]}
    """;
  @Test void parsesVerifiedBannerFields() throws Exception {
    var result=BannerFeed.parse(json.readTree(sample),"202710","CS3100",Instant.now());
    assertEquals(1,result.sections().size());var seat=result.sections().get(0);
    assertEquals("banner:202710:17206",seat.id());assertEquals(2,seat.available());
    assertTrue(seat.meetingSummary().contains("Mon / Wed"));assertFalse(seat.title().contains("&amp;"));
  }
  @Test void missingSeatCountIsAnErrorNotZero() throws Exception {
    var root=json.readTree(sample.replace("\"seatsAvailable\":2,",""));
    assertThrows(IOException.class,()->BannerFeed.parse(root,"202710","CS3100",Instant.now()));
  }
  @Test void excludesOtherTermsRatherThanMixingSemesterCrns() throws Exception {
    assertTrue(BannerFeed.parse(json.readTree(sample),"202630","CS3100",Instant.now()).sections().isEmpty());
  }
  @Test void overEnrollmentStaysNegativeInsteadOfBeingInvented() throws Exception {
    assertEquals(-2,BannerFeed.parse(json.readTree(sample.replace("\"seatsAvailable\":2","\"seatsAvailable\":-2")),"202710","CS3100",Instant.now()).sections().get(0).available());
  }
  @Test void preventsPushEndpointSsrf(){
    assertThrows(IllegalArgumentException.class,()->PushController.validateEndpoint("http://127.0.0.1/admin"));
    assertThrows(IllegalArgumentException.class,()->PushController.validateEndpoint("https://fcm.googleapis.com.evil.example/send"));
    assertThrows(IllegalArgumentException.class,()->PushController.validateEndpoint("https://user@fcm.googleapis.com/send"));
    assertDoesNotThrow(()->PushController.validateEndpoint("https://fcm.googleapis.com/fcm/send/test"));
  }
}
