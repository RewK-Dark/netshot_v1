ARG NETSHOT_VERSION=0.0.1-dev
ARG GRAALVM_VERSION=17.0.8

FROM debian:11-slim
ARG GRAALVM_VERSION
RUN export http_proxy=http://10.57.10.34:3128
RUN export https_proxy=http://10.57.10.34:3128
ENV http_proxy=http://10.57.10.34:3128
ENV https_proxy=http://10.57.10.34:3128
RUN apt-get -y update && apt-get -y install wget
WORKDIR /usr/lib/jvm
RUN wget --quiet https://download.oracle.com/graalvm/${GRAALVM_VERSION%%.*}/archive/graalvm-jdk-${GRAALVM_VERSION}_linux-x64_bin.tar.gz && \ 
    tar xvzf graalvm-jdk-${GRAALVM_VERSION}_linux-x64_bin.tar.gz && \
    rm -f graalvm-jdk-${GRAALVM_VERSION}_linux-x64_bin.tar.gz && \
    ln -sfn graalvm-jdk-${GRAALVM_VERSION}* graalvm && \
    update-alternatives --install /usr/bin/java java /usr/lib/jvm/graalvm/bin/java 92100
RUN /usr/lib/jvm/graalvm/bin/gu install js python
RUN apt-get -y install unzip
RUN mkdir /usr/local/netshot
RUN /usr/lib/jvm/graalvm/bin/keytool -genkey -keyalg RSA -alias selfsigned -keystore /usr/local/netshot/netshot.pfx -storepass password -validity 820 -keysize 4096 -storetype pkcs12 -ext san=dns:localhost -dname "CN=localhost, OU=Netshot, O=Netshot, L=A, ST=OCC, C=FR" -ext KeyUsage=nonRepudiation,digitalSignature,keyEncipherment -ext ExtendedKeyUsage=serverAuth
RUN wget https://github.com/netfishers-onl/Netshot/releases/download/v0.19.4/netshot_0.19.4.zip
RUN unzip netshot_0.19.4.zip
RUN mkdir /usr/local/netshot/drivers
RUN cp netshot.jar /usr/local/netshot/netshot.jar
RUN mkdir /var/local/netshot
RUN mkdir /var/log/netshot
RUN cp netshot.conf.docker /etc/netshot.conf
RUN chmod 400 /etc/netshot.conf

EXPOSE 8080
CMD ["/usr/bin/java", "-jar", "/usr/local/netshot/netshot.jar"]
