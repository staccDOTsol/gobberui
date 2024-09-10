import { Center, Container, Flex, Group, Menu, Title } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

import classes from './Header.module.css';
import { MetaplexLogo, MetaplexLogoVariant } from '../MetaplexLogo';
import { Env } from '@/providers/useEnv';
import RetainQueryLink from '../RetainQueryLink';

const HeaderLink = ({ label, link, disabled }: { label: string, link: string, disabled?: boolean }) => {
  const cls = disabled ? [classes.disabled, classes.link].join(' ') : classes.link;
  return (
    <RetainQueryLink href={link} className={cls}>
      {label}
    </RetainQueryLink>
  );
};

export function Header({ env, setEnv }: { env: string; setEnv: (env: Env) => void }) {
  return (
    <Container
      size="xl"
      h={80}
      pt={12}
    >
      <div className={classes.inner}>
        <Flex justify="center" align="center" gap="md">
          <RetainQueryLink href="/">
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="20" cy="20" r="18" fill="#39FF14"/>
              <path d="M12 20C12 16.6863 14.6863 14 18 14H22C25.3137 14 28 16.6863 28 20V26C28 27.1046 27.1046 28 26 28H14C12.8954 28 12 27.1046 12 26V20Z" fill="black"/>
              <circle cx="16" cy="19" r="2" fill="white"/>
              <circle cx="24" cy="19" r="2" fill="white"/>
              <path d="M15 24H25M15 24L18 26M15 24L18 22M25 24L22 26M25 24L22 22" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </RetainQueryLink>
          <Title order={2}>The Token Gobbler</Title>
        </Flex>
        <Group>
          <HeaderLink label="Create" link="/create" />
          <WalletMultiButton />
          <Menu trigger="hover" transitionProps={{ exitDuration: 0 }} withinPortal>
            <Menu.Target>
              <a
                href={undefined}
                className={classes.link}
                onClick={(event) => event.preventDefault()}
              >
                <Center>
                  <span className={classes.linkLabel}>{env}</span>
                  <IconChevronDown size="0.9rem" stroke={1.5} />
                </Center>
              </a>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={() => setEnv('mainnet')}>Mainnet</Menu.Item>
              <Menu.Item onClick={() => setEnv('devnet')}>Devnet</Menu.Item>
              <Menu.Item onClick={() => setEnv('localhost')}>Localhost</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </div>
    </Container>
  );
}
