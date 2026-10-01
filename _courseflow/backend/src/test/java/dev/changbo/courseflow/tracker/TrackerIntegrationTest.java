package dev.changbo.courseflow.tracker;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.*;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.server.ResponseStatusException;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static dev.changbo.courseflow.tracker.TrackerModels.*;
import static dev.changbo.courseflow.tracker.TrackerRepository.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
class TrackerIntegrationTest {
  @Autowired MockMvc mvc; @Autowired ObjectMapper json; @Autowired TrackerRepository repo;
  @Autowired TrackerService tracker; @Autowired AuthService auth; @Autowired CatalogService catalog;
  @MockBean MailGateway mail; @SpyBean DemoFeed feed;
  String userA,userB;
  @BeforeEach void setup(){
    repo.jdbc().update("DELETE FROM cf_push_devices");repo.jdbc().update("DELETE FROM cf_notifications");
    repo.jdbc().update("DELETE FROM cf_watches");repo.jdbc().update("DELETE FROM cf_samples");repo.jdbc().update("DELETE FROM cf_sections");
    repo.jdbc().update("DELETE FROM cf_login_codes");repo.jdbc().update("DELETE FROM cf_users");
    userA=newUser("a@example.test");userB=newUser("b@example.test");
  }
  String newUser(String email){String user=id();repo.jdbc().update("INSERT INTO cf_users(id,email,created_at) VALUES(?,?,?)",user,email,ts(Instant.now()));return user;}
  Seat seat(String id,int available,Instant time){return new Seat(id,"demo","202710","DEMO-31001","CS3100","Demo course","01","Demo instructor","Mon 10:00",100,available,time,time,null);}
  @Test void publicSearchPrivateWatchlistAndCsrf() throws Exception {
    mvc.perform(get("/api/catalog/terms")).andExpect(status().isOk());
    mvc.perform(get("/api/watchlist")).andExpect(status().isUnauthorized());
    mvc.perform(post("/api/watchlist").with(user(userA)).contentType("application/json").content("{}"))
      .andExpect(status().isForbidden());
    mvc.perform(get("/api/catalog/sections").param("term","202710").param("q",";DROP TABLE cf_users"))
      .andExpect(status().isBadRequest());
  }
  @Test void loginUsesRealSessionAndCodeCannotBeReplayed() throws Exception {
    var initial=mvc.perform(get("/api/auth/csrf")).andExpect(status().isOk()).andReturn();
    MockHttpSession session=(MockHttpSession)initial.getRequest().getSession();String oldId=session.getId();
    var token=json.readTree(initial.getResponse().getContentAsString());
    var requested=mvc.perform(post("/api/auth/request-code").session(session).header(token.get("headerName").asText(),token.get("token").asText())
      .contentType("application/json").content("{\"email\":\"owner@example.test\"}")).andExpect(status().isOk()).andReturn();
    String code=json.readTree(requested.getResponse().getContentAsString()).get("demoCode").asText();
    String payload=json.writeValueAsString(Map.of("email","owner@example.test","code",code));
    mvc.perform(post("/api/auth/verify").session(session).with(csrf()).contentType("application/json").content(payload))
      .andExpect(status().isOk()).andExpect(jsonPath("$.signedIn").value(true));
    assertNotEquals(oldId,session.getId());
    mvc.perform(get("/api/auth/me").session(session)).andExpect(jsonPath("$.email").value("owner@example.test"));
    mvc.perform(post("/api/auth/verify").with(csrf()).contentType("application/json").content(payload)).andExpect(status().isBadRequest());
  }
  @Test void codesExpireAndFiveWrongAttemptsBlockTheCorrectCode(){
    String correct=auth.requestCode("a@example.test").get("demoCode");
    String wrong=correct.equals("000000")?"111111":"000000";
    for(int i=0;i<5;i++)assertThrows(ResponseStatusException.class,()->auth.verify("a@example.test",wrong));
    assertThrows(ResponseStatusException.class,()->auth.verify("a@example.test",correct));
    String second=auth.requestCode("b@example.test").get("demoCode");
    repo.jdbc().update("UPDATE cf_login_codes SET expires_at=? WHERE email=?",ts(Instant.now().minusSeconds(1)),"b@example.test");
    assertThrows(ResponseStatusException.class,()->auth.verify("b@example.test",second));
  }
  @Test void usersCannotReadOrDeleteEachOthersWatches() throws Exception {
    tracker.observe(seat("demo:202710:DEMO-31001",0,Instant.now()));
    Watch w=tracker.add(userA,"demo:202710:DEMO-31001",1);
    mvc.perform(get("/api/watchlist").with(user(userB))).andExpect(jsonPath("$.length()").value(0));
    mvc.perform(delete("/api/watchlist/"+w.id()).with(user(userB)).with(csrf())).andExpect(status().isNotFound());
    assertEquals(1,repo.watches(userA).size());
    assertEquals(w.id(),tracker.add(userA,w.sectionId(),1).id());
  }
  @Test void notifyOnThresholdCrossingWithoutRearmingOnSourceFailure(){
    Instant start=Instant.now();String section="demo:202710:DEMO-31001";
    tracker.observe(seat(section,0,start));tracker.add(userA,section,2);
    tracker.observe(seat(section,1,start.plusMillis(1)));assertEquals(0,repo.notices(userA).size());
    tracker.observe(seat(section,2,start.plusMillis(2)));assertEquals(1,repo.notices(userA).size());
    tracker.observe(seat(section,3,start.plusMillis(3)));assertEquals(1,repo.notices(userA).size());
    tracker.failed(section,"Source down");assertEquals(3,repo.require(section).available());assertFalse(tracker.fresh(repo.require(section)));
    tracker.observe(seat(section,3,start.plusMillis(4)));assertEquals(1,repo.notices(userA).size());
    tracker.observe(seat(section,0,start.plusMillis(5)));tracker.observe(seat(section,2,start.plusMillis(6)));
    assertEquals(2,repo.notices(userA).size());
  }
  @Test void staleSnapshotsAndPausedWatchesDoNotGenerateAlerts(){
    String section="demo:202710:DEMO-31001";tracker.observe(seat(section,6,Instant.now().minusSeconds(3600)));
    Watch watch=tracker.add(userA,section,1);assertEquals(0,repo.notices(userA).size());
    tracker.edit(userA,watch.id(),1,false);tracker.observe(seat(section,9,Instant.now()));assertEquals(0,repo.notices(userA).size());
    tracker.edit(userA,watch.id(),1,true);assertEquals(1,repo.notices(userA).size());
  }
  @Test void oneUpstreamRequestServesMultipleSubscribersAndSections(){
    var sections=feed.search("202710","CS3100").sections();sections.forEach(tracker::observe);
    tracker.add(userA,sections.get(0).id(),1);tracker.add(userB,sections.get(0).id(),1);tracker.add(userA,sections.get(1).id(),1);
    clearInvocations(feed);
    new MonitorJobs(repo,catalog,tracker,mail,"demo","http://localhost",true,true).poll();
    verify(feed,times(1)).search("202710","CS3100");
  }
  @Test void outboxRetriesWithBackoffAndKeepsTheInAppAlert(){
    tracker.observe(seat("demo:202710:DEMO-31001",2,Instant.now()));tracker.add(userA,"demo:202710:DEMO-31001",1);
    var jobs=new MonitorJobs(repo,catalog,tracker,mail,"demo","http://localhost",true,false);
    doThrow(new org.springframework.mail.MailSendException("temporary")).when(mail).send(anyString(),anyString(),anyString());
    jobs.deliver();assertEquals("PENDING",repo.notices(userA).get(0).delivery());assertEquals(1,repo.notices(userA).get(0).attempts());
    jobs.deliver();assertEquals(1,repo.notices(userA).get(0).attempts());
    repo.jdbc().update("UPDATE cf_notifications SET next_attempt_at=?",ts(Instant.now().minusSeconds(1)));
    doNothing().when(mail).send(anyString(),anyString(),anyString());jobs.deliver();
    assertEquals("SENT",repo.notices(userA).get(0).delivery());assertEquals(2,repo.notices(userA).get(0).attempts());
  }
}
