Um aus dem vorliegenden Architekturplan (Markdown) eine intuitive, moderne und gut bedienbare Web-App zu machen, würde ich das Interface in SvelteKit mit Tailwind CSS nach einem Dashboard \& Control Center-Prinzip aufbauen.



Der Fokus muss darauf liegen, die Komplexität der vier verschiedenen APIs vor dem Nutzer zu verbergen, aber dem Admin/User volle Kontrolle über die Syncs, Zugangsdaten und Datenflüsse (wie Home Assistant / MQTT) zu geben.



So könnte die Seite in der Praxis aufgebaut sein:



1\. Farbwelt, Theme \& Design-System

Dunkles / Adaptives Layout (Dark Mode First): Smart-Home-Dashboards und technische Hubs wirken in einem sauberen Dark-Mode (z. B. Slate/Zinc-Farbtöne aus Tailwind) besonders aufgeräumt.



Store-Branding als Akzentfarben: Um in Listen sofort zu erkennen, woher ein Bon stammt, bekommt jeder Store seine prägnante Akzentfarbe (als feiner Badge, Rand oder Dot):



REWE: Rot (bg-red-600)



PENNY: Dunkelrot/Magenta (bg-rose-700)



LIDL: Blau/Gelb Accent (bg-blue-600 mit gelbem Indikator)



ROSSMANN: Deep Red / Rosa (bg-red-700)



2\. Hauptnavigation (Sidebar oder Header)

Eine kompakte Sidebar auf der linken Seite (oder eine schlanke Top-Bar):



📊 Dashboard (Übersicht \& Aggregation)



🧾 Kassenzettel (Ausgaben \& Suche)



🛍️ Märkte / Module (Status, Login \& Konfiguration)



⚙️ Einstellungen (MQTT, Datenbank, Sicherung)



3\. Die Hauptseiten im Detail

A. Das Dashboard (Startseite)

Hier fließen alle Daten zusammen. Ideal für den schnellen Überblick:



Statistik-Cards (Top):



Gesamtausgaben diesen Monat (z. B. 342,80 €).



Anzahl Bons Monat (z. B. 12 Einkäufe).



Top-Supermarkt (z. B. REWE (60%)).



Letzter Sync Status (z. B. Vor 10 Min. • 4/4 aktiv).



Verlaufsgrafik: Ein schlankes Balkendiagramm (z. B. mit Layerchart oder Chart.js), das die Monatsausgaben aufgeschlüsselt nach Supermarkt anzeigt.



Neueste Belege: Eine Liste der letzten 5 Einkäufe mit Schnellzugriff auf das PDF/die Details.



B. Die Kassenzettel-Übersicht (/receipts)

Die zentrale Anlaufstelle für die Recherche und den Export.



Filter- \& Suchleiste (Oben):



Freitextsuche: Nach Markt, Ort oder sogar einzelnen Artikeln (für LIDL/Rossmann \& geparste REWE/Penny-PDFs).



Store-Filter: Buttons/Pills zum An-/Abwählen (\[Alle] \[REWE] \[PENNY] \[LIDL] \[ROSSMANN]).



Datumsbereich: Schnellfilter (Diesen Monat, Letzten Monat, Dieses Jahr, Benutzerdefiniert).



Die Bon-Tabelle / Cards:



Spalten: Store-Badge, Datum \& Uhrzeit, Filiale/Ort, Artikel-Anzahl (falls bekannt), Gesamtbetrag (fett formatiert, z. B. 45,99 €), Aktionen (PDF anzeigen, JSON, Sync-Status).



Detail-Drawer / Modal: Klickt man auf einen Bon, öffnet sich seitlich ein Panel (Slide-over):



Links/Oben: Bisherige Metadaten + Artikelzeilen als strukturierte Liste (Name, Menge, Einzelpreis, Gesamtpreis).



Rechts/Unten: Das gerenderte PDF bzw. das aus der LIDL-HTML gerenderte PDF in einer interaktiven Vorschau mit Download-Button.



C. Modul- \& Markt-Verwaltung (/stores)

Hier spiegelt sich Abschnitt 4 (Modul-Contract) und Abschnitt 6 (Fallstricke) des Markdown-Dokuments im UI wider:



Jeder Supermarkt bekommt eine eigene Card mit Status-Indikator:



Status-Header:



Store-Logo/Name, An/Aus-Toggle (deaktivierte Module werden beim Sync ignoriert).



Status-Dot: 🟢 Verbunden | 🟡 Token läuft ab | 🔴 Login erforderlich.



Login-Aktionen (spezifisch je nach Modul-Typ):



REWE / PENNY: Button "Mit \[Store] verbinden". Öffnet den PKCE-Flow. Bei PENNY ein Eingabefeld für den Callback-URL-Redirect.



ROSSMANN: Eingabemasken für E-Mail \& Passwort direkt in der Card (gemäß credentials-Strategie).



LIDL: Spezielle Step-by-Step-Anleitung wegen reCAPTCHA:



Button: "Login-Seite im Browser öffnen".



Input-Feld: "Redirect-URL / Code hier einfügen".



Button: "Token generieren".



Zusatz-Infos: Datum des letzten erfolgreichen Syncs, Anzahl gespeicherter Bons, Button für manuellen Einzel-Sync.



D. Home Assistant \& MQTT Settings (/settings/mqtt)

Da die App als Zubringer für Home Assistant dient (Abschnitt 8):



MQTT Broker Setup: Host, Port, Username, Passwort, Base-Topic (z. B. bonsync/ oder bon2mqtt/).



Auto-Publish Switches:



\[x] Neuen Bon sofort als MQTT-Event feuern (bonsync/receipt/new).



\[x] Monats-Summen als Sensor-State aktualisieren (sensor.supermarkt\_ausgaben\_monat).



Test-Button: "Test-Payload an Home Assistant senden".



4\. Technische UX-Kniffe (für SvelteKit \& Tailwind)

Toast-Notifications (Svelte-Store):



Da Synchro-Prozesse im Hintergrund laufen oder wegen mTLS/Netzwerk mal fehlschlagen können, gibt es unten rechts dezente Benachrichtigungen ("REWE: 3 neue Bons importiert", "LIDL: Re-Login erforderlich").



Skeleton-Loader:



Beim Nachladen von Belegen oder beim Rendern des LIDL-PDFs (Headless Browser benötigt kurz Zeit) zeigen Lade-Skelette, dass im Hintergrund gepollt/gearbeitet wird.



Responsive Design:



Auf dem Smartphone zeigt die Kassenzettel-Ansicht kompakte Cards statt der großen Tabelle, sodass man auch unterwegs beim Verlassen des Supermarkts schnell prüfen kann, ob der Bon schon da ist.

