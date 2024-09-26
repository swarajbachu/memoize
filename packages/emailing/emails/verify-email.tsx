import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

interface VerifyEmailEmailProps {
  magicLink?: string;
}

const baseUrl = "https://app.memoize.co";

export const VerifyEmailEmail = ({ magicLink }: VerifyEmailEmailProps) => (
  <Html>
    <Head />
    <Preview>Verify Your Email for Memoize</Preview>
    <Body style={main}>
      <Container style={container}>
        <Img
          src={`${baseUrl}/logo.png`}
          width={48}
          height={48}
          alt="Memoize logo"
        />
        <Heading style={headingSmall}>
          Hey Sup dude 👋, thanks for signing up for Memoize 🪛, but that
          doesn't mean you can use it. You need to verify your email first. HeHe
        </Heading>
        <Heading style={heading}>🪄 Your Verification link</Heading>
        <Section style={body}>
          <Text style={paragraph}>
            <Link style={link} href={magicLink}>
              👉 Click here to Verify your email 👈
            </Link>
          </Text>
          <Text style={paragraph}>
            If you didn't request this, please ignore this email.
          </Text>
        </Section>
        <Text style={paragraph}>
          Best,
          <br />- Swaraj
        </Text>
        <Hr style={hr} />
        <Img
          src={`${baseUrl}/logo.png`}
          width={32}
          height={32}
          style={{
            WebkitFilter: "grayscale(100%)",
            filter: "grayscale(100%)",
            margin: "20px 0",
          }}
        />
        <Text style={footer}>Memoize</Text>
        <Text style={footer}>Earth</Text>
      </Container>
    </Body>
  </Html>
);

VerifyEmailEmail.PreviewProps = {
  magicLink: "https://raycast.com",
} as VerifyEmailEmailProps;

export default VerifyEmailEmail;

const main = {
  backgroundColor: "#ffffff",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Oxygen-Sans,Ubuntu,Cantarell,"Helvetica Neue",sans-serif',
};

const container = {
  margin: "0 auto",
  padding: "20px 25px 48px",
  backgroundImage: 'url("/assets/raycast-bg.png")',
  backgroundPosition: "bottom",
  backgroundRepeat: "no-repeat, no-repeat",
};

const heading = {
  fontSize: "28px",
  fontWeight: "bold",
  marginTop: "48px",
};

const headingSmall = {
  fontSize: "14px",
  fontWeight: "400",
  marginTop: "14px",
};

const body = {
  margin: "24px 0",
};

const paragraph = {
  fontSize: "16px",
  lineHeight: "26px",
};

const link = {
  color: "#84cc16",
};

const hr = {
  borderColor: "#dddddd",
  marginTop: "48px",
};

const footer = {
  color: "#8898aa",
  fontSize: "12px",
  marginLeft: "4px",
};
